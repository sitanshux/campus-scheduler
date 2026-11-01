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
  Sparkles,
  Monitor,
  CalendarDays,
  DoorOpen,
} from 'lucide-react';
import { fetchFullTimetableData, clearTimetableCache } from '../services/api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';
import type { FullTimetableData, ScheduledSession } from '../types';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayShort = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const timeSlots = [
  '08:00', // Slot 0 -> Period 1 (08:00 – 09:00)
  '09:00', // Slot 1 -> Period 2 (09:00 – 10:00)
  '10:00', // Slot 2 -> Period 3 (10:00 – 11:00)
  '11:00', // Slot 3 -> Period 4 (11:00 – 12:00)
  '12:00', // Slot 4 -> Period 5 (12:00 – 13:00)
  '13:00', // Slot 5 -> Lunch Break (13:00 – 14:00)
  '14:00', // Slot 6 -> Period 6 (14:00 – 15:00)
  '15:00', // Slot 7 -> Period 7 (15:00 – 16:00)
  '16:00', // Slot 8 -> Period 8 (16:00 – 17:00)
  '17:00', // Slot 9 -> Period 9 (17:00 – 18:00)
];

const DAY_INDEX: Record<string, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

export type SessionKindColor = 'yellow' | 'blue' | 'lavender' | 'green' | 'pink';

interface TimetableBlock {
  id: string;
  code: string;
  name: string;
  venue: string;
  roomId: string;
  day: number;       // 0 = Monday ... 6 = Sunday
  startSlot: number; // 0 = 8 AM, 6 = 2 PM
  span: number;      // duration in periods
  color: SessionKindColor;
  kind: string;
  facultyName: string;
  facultyId: string;
  groups: string[];
  period: number;
  duration: number;
  timeSlotString: string;
  size: number;
  hasConflict?: boolean;
}

const pastelThemes: Record<
  SessionKindColor,
  {
    bg: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    text: string;
    subText: string;
    iconBg: string;
    avatarBg: string;
  }
> = {
  yellow: {
    bg: 'bg-[#FDF8E2]',
    border: 'border-[#F2DF8E]',
    badgeBg: 'bg-[#F4DA69]/40',
    badgeText: 'text-[#6B530E]',
    text: 'text-[#4A3805]',
    subText: 'text-[#7D6B30]',
    iconBg: 'bg-[#F4DA69]/50 text-[#6B530E]',
    avatarBg: 'bg-[#6B530E] text-white',
  },
  blue: {
    bg: 'bg-[#F0F5FC]',
    border: 'border-[#C8DAF2]',
    badgeBg: 'bg-[#B8CDEB]/40',
    badgeText: 'text-[#1E3A5F]',
    text: 'text-[#1A314E]',
    subText: 'text-[#486382]',
    iconBg: 'bg-[#B8CDEB]/50 text-[#1E3A5F]',
    avatarBg: 'bg-[#1E3A5F] text-white',
  },
  lavender: {
    bg: 'bg-[#F4F3FD]',
    border: 'border-[#CFCCF7]',
    badgeBg: 'bg-[#B9B5F4]/40',
    badgeText: 'text-[#3E3882]',
    text: 'text-[#2E2963]',
    subText: 'text-[#5C5599]',
    iconBg: 'bg-[#B9B5F4]/50 text-[#3E3882]',
    avatarBg: 'bg-[#3E3882] text-white',
  },
  green: {
    bg: 'bg-[#F2F8F4]',
    border: 'border-[#C7E3CE]',
    badgeBg: 'bg-[#B9D9C2]/45',
    badgeText: 'text-[#194E2C]',
    text: 'text-[#153D23]',
    subText: 'text-[#426E50]',
    iconBg: 'bg-[#B9D9C2]/50 text-[#194E2C]',
    avatarBg: 'bg-[#194E2C] text-white',
  },
  pink: {
    bg: 'bg-[#FCF2F7]',
    border: 'border-[#F3C4DF]',
    badgeBg: 'bg-[#E9A8CE]/35',
    badgeText: 'text-[#732450]',
    text: 'text-[#541A3B]',
    subText: 'text-[#874A6E]',
    iconBg: 'bg-[#E9A8CE]/50 text-[#732450]',
    avatarBg: 'bg-[#732450] text-white',
  },
};

function getSessionColor(kind: string): SessionKindColor {
  const k = (kind || '').toLowerCase();
  if (k === 'lab' || k.includes('lab') || k.includes('practical')) return 'lavender';
  if (k === 'tutorial' || k.includes('tut')) return 'green';
  if (k === 'lecture' || k.includes('lec')) return 'blue';
  if (k === 'event' || k.includes('event')) return 'pink';
  return 'yellow';
}

function getSessionIcon(kind: string) {
  const k = (kind || '').toLowerCase();
  if (k === 'lab' || k.includes('lab')) return Monitor;
  if (k === 'tutorial' || k.includes('tut')) return Users;
  if (k === 'lecture' || k.includes('lec')) return BookOpen;
  return Sparkles;
}

function getFacultyInitials(name: string): string {
  const cleaned = name
    .replace(/\([^)]*\)/g, '')
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return 'FM';
}

function periodToStartSlot(period: number): number {
  if (period <= 5) {
    return period - 1;
  }
  // Period 6 starts at 14:00, which corresponds to index 6 ('14:00')
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

interface TimetablePageProps {
  selectedFacultyId?: string | null;
  onClearFacultyFilter?: () => void;
  onFacultyChange?: (facultyId: string | null) => void;
}

export default function TimetablePage({
  selectedFacultyId = null,
  onClearFacultyFilter,
  onFacultyChange,
}: TimetablePageProps = {}) {
  const [department, setDepartment] = useState('CSE');
  const [semester, setSemester] = useState('3rd');
  const [section, setSection] = useState('Y1-A');
  const [selectedSession, setSelectedSession] = useState<TimetableBlock | null>(null);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [internalFacultyId, setInternalFacultyId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [mobileSelectedDay, setMobileSelectedDay] = useState<number>(0);
  const [viewType, setViewType] = useState<'cohort' | 'faculty' | 'room'>(
    selectedFacultyId ? 'faculty' : 'cohort'
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>('CS-LAB-1');

  // If selectedFacultyId is explicitly set by parent, prioritize it; otherwise use local filter
  const activeFacultyId = selectedFacultyId !== undefined && selectedFacultyId !== null
    ? selectedFacultyId
    : internalFacultyId;

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  // Seven days from Monday to Sunday
  const weekDates = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      return d;
    });
  }, [monday]);

  const todayDayIdx = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    return day === 0 ? 6 : day - 1;
  }, []);

  const formattedWeekRange = useMemo(() => {
    const sunday = weekDates[6];
    const startMonth = monday.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = sunday.toLocaleDateString('en-US', { month: 'short' });
    const startDay = monday.getDate();
    const endDay = sunday.getDate();
    const year = sunday.getFullYear();

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
        roomId: s.room_id,
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

  const allFaculty = useMemo(() => {
    return timetableData?.dataset?.faculty ?? [];
  }, [timetableData]);

  const allRooms = useMemo(() => {
    return timetableData?.dataset?.rooms ?? [];
  }, [timetableData]);

  const isFacultyFilterActive = Boolean(activeFacultyId);

  const activeFaculty = useMemo(() => {
    if (!activeFacultyId || allFaculty.length === 0) return null;
    return allFaculty.find((f) => f.id === activeFacultyId) ?? null;
  }, [activeFacultyId, allFaculty]);

  const handleFacultySelect = (fId: string | null) => {
    setInternalFacultyId(fId);
    onFacultyChange?.(fId);
  };

  const handleClearFaculty = () => {
    setInternalFacultyId(null);
    onClearFacultyFilter?.();
    onFacultyChange?.(null);
  };

  // Filter sessions based on selected department, semester, and section OR selected faculty
  const targetGroups = useMemo(
    () => getTargetGroups(department, semester, isYear1 ? section : undefined),
    [department, semester, isYear1, section],
  );

  const filteredSessions = useMemo(() => {
    let list: TimetableBlock[] = [];
    if (viewType === 'faculty') {
      const fId = activeFacultyId || (allFaculty[0]?.id ?? '');
      list = mappedSessions.filter((s) => s.facultyId === fId);
    } else if (viewType === 'room') {
      const rId = selectedRoomId || (allRooms[0]?.id ?? '');
      list = mappedSessions.filter((s) => s.roomId === rId);
    } else {
      if (targetGroups.length === 0) {
        list = [];
      } else {
        list = mappedSessions.filter((s) => s.groups.some((g) => targetGroups.includes(g)));
      }
    }

    // Detect overlapping conflict sessions in current view
    return list.map((session) => {
      const hasConflict = list.some(
        (other) =>
          other.id !== session.id &&
          other.day === session.day &&
          Math.max(session.startSlot, other.startSlot) <
            Math.min(session.startSlot + session.span, other.startSlot + other.span)
      );
      return { ...session, hasConflict };
    });
  }, [mappedSessions, viewType, activeFacultyId, allFaculty, selectedRoomId, allRooms, targetGroups]);

  // Session counts per day for the day selector pills
  const daySessionsCount = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const s of filteredSessions) {
      counts[s.day] = (counts[s.day] || 0) + 1;
    }
    return counts;
  }, [filteredSessions]);

  // Sessions for currently selected mobile/day view
  const activeDaySessions = useMemo(() => {
    return filteredSessions
      .filter((s) => s.day === mobileSelectedDay)
      .sort((a, b) => a.startSlot - b.startSlot);
  }, [filteredSessions, mobileSelectedDay]);

  const diagnostics = timetableData?.schedule?.diagnostics;
  const isOptimalOrFeasible =
    timetableData?.schedule?.status === 'OPTIMAL' ||
    timetableData?.schedule?.status === 'FEASIBLE';

  return (
    <div className="space-y-6">
      {/* ── Top Utility & Navigation Controls Header (Intelly Style) ── */}
      <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Date Range Navigator & Quick Jump */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-[#FAF6ED] border border-[#E8E1D5] rounded-full p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              aria-label="Previous week"
              title="Previous week (-7 days)"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#75716B] hover:bg-white hover:text-[#1E1E1E] transition-colors cursor-pointer"
            >
              <ChevronLeft size={15} />
            </button>

            <button
              type="button"
              onClick={() => {
                setWeekOffset(0);
                setMobileSelectedDay(todayDayIdx);
              }}
              title={weekOffset === 0 ? 'Current academic week' : 'Click to jump to current week'}
              className="px-3 py-1 rounded-full text-xs font-bold text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Calendar size={13} className="text-[#E9A8CE]" />
              <span>{formattedWeekRange}</span>
              {weekOffset === 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#E9A8CE]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              aria-label="Next week"
              title="Next week (+7 days)"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#75716B] hover:bg-white hover:text-[#1E1E1E] transition-colors cursor-pointer"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Segmented View Mode: Student Cohort | Faculty | Room / Venue */}
          <div className="flex items-center bg-[#FAF6ED] border border-[#E8E1D5] rounded-full p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewType('cohort');
                handleClearFaculty();
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewType === 'cohort'
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'text-[#75716B] hover:text-[#1E1E1E]'
              }`}
            >
              <Users size={12} className={viewType === 'cohort' ? 'text-[#E9A8CE]' : ''} />
              <span>Cohort</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewType('faculty');
                if (!activeFacultyId && allFaculty.length > 0) {
                  handleFacultySelect(allFaculty[0].id);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewType === 'faculty'
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'text-[#75716B] hover:text-[#1E1E1E]'
              }`}
            >
              <User size={12} className={viewType === 'faculty' ? 'text-[#E9A8CE]' : ''} />
              <span>Faculty</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewType('room');
                handleClearFaculty();
                if (!selectedRoomId && allRooms.length > 0) {
                  setSelectedRoomId(allRooms[0].id);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewType === 'room'
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'text-[#75716B] hover:text-[#1E1E1E]'
              }`}
            >
              <DoorOpen size={12} className={viewType === 'room' ? 'text-[#E9A8CE]' : ''} />
              <span>Room</span>
            </button>
          </div>

          {/* View mode toggle pills (Day / Week) */}
          <div className="flex items-center bg-[#FAF6ED] border border-[#E8E1D5] rounded-full p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('day');
                setMobileSelectedDay(todayDayIdx);
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'day'
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'text-[#75716B] hover:text-[#1E1E1E]'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'text-[#75716B] hover:text-[#1E1E1E]'
              }`}
            >
              Week
            </button>
          </div>
        </div>

        {/* Right: Filters & Solver Regenerate Action */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Conditional Controls depending on viewType */}
          {viewType === 'faculty' && (
            <div className="relative">
              <select
                value={activeFacultyId ?? (allFaculty[0]?.id ?? '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleFacultySelect(val);
                  }
                }}
                className="appearance-none rounded-full border border-[#E9A8CE] bg-[#FFFDF8] px-3.5 py-2 pr-8 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none cursor-pointer hover:bg-[#FAF6ED]"
                title="Select faculty member schedule"
              >
                {allFaculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.department})
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-[#75716B] pointer-events-none" />
            </div>
          )}

          {viewType === 'room' && (
            <div className="relative">
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="appearance-none rounded-full border border-[#B8CDEB] bg-[#FFFDF8] px-3.5 py-2 pr-8 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#B8CDEB] focus:outline-none cursor-pointer hover:bg-[#FAF6ED]"
                title="Select room or laboratory venue"
              >
                <optgroup label="Computer Laboratories">
                  {allRooms.filter((r) => r.type.startsWith('lab') || r.id.includes('LAB')).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id} • {r.capacity} seats)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Lecture Halls & Auditoriums">
                  {allRooms.filter((r) => r.type === 'lecture_hall' || r.type === 'auditorium' || r.id.startsWith('LH') || r.id.startsWith('AUD')).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id} • {r.capacity} seats)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Classrooms & Workshops">
                  {allRooms.filter((r) => !r.id.includes('LAB') && !r.id.startsWith('LH') && !r.id.startsWith('AUD')).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id} • {r.capacity} seats)
                    </option>
                  ))}
                </optgroup>
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-[#75716B] pointer-events-none" />
            </div>
          )}

          {viewType === 'cohort' && (
            <>
              {/* Department Filter */}
              <div className="relative">
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FFFDF8] px-3.5 py-2 pr-8 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none cursor-pointer hover:bg-[#FAF6ED]"
                >
                  <option value="CSE">CSE Dept</option>
                  <option value="ECE">ECE Dept</option>
                  <option value="EEE">EEE Dept</option>
                  <option value="ME">ME Dept</option>
                  <option value="CE">CE Dept</option>
                  <option value="COMMON">Common (Year 1)</option>
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-[#75716B] pointer-events-none" />
              </div>

              {/* Semester Filter */}
              <div className="relative">
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FFFDF8] px-3.5 py-2 pr-8 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none cursor-pointer hover:bg-[#FAF6ED]"
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
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-[#75716B] pointer-events-none" />
              </div>

              {/* Section Selector for Year 1 */}
              {isYear1 && (
                <div className="relative">
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FFFDF8] px-3.5 py-2 pr-8 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none cursor-pointer hover:bg-[#FAF6ED]"
                  >
                    <option value="Y1-A">Section A (Y1-A)</option>
                    <option value="Y1-B">Section B (Y1-B)</option>
                    <option value="Y1-C">Section C (Y1-C)</option>
                    <option value="Y1-D">Section D (Y1-D)</option>
                  </select>
                  <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-[#75716B] pointer-events-none" />
                </div>
              )}
            </>
          )}

          {/* Regenerate Action Button */}
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-[#1E1E1E] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-black transition-all cursor-pointer disabled:opacity-50"
            title="Re-run the CP-SAT schedule solver"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Solving…' : 'Regenerate'}</span>
          </button>
        </div>
      </div>

      {/* ── Active Faculty Schedule Banner (when filtered by instructor) ── */}
      {isFacultyFilterActive && activeFaculty && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-[20px] border border-[#B9D9C2]/60 bg-[#B9D9C2]/20 px-5 py-3 shadow-2xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1B4D2E]" />
            <span className="text-xs font-bold text-[#1B4D2E]">Faculty Timetable Active:</span>
            <span className="text-xs font-extrabold text-[#1E1E1E] bg-[#FFFDF8] border border-[#B9D9C2]/80 px-2.5 py-0.5 rounded-full">
              {activeFaculty.name} ({activeFaculty.department})
            </span>
            <span className="text-xs text-[#75716B] font-medium">
              • {filteredSessions.length} weekly sessions assigned
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearFaculty}
            className="text-xs font-bold text-[#1B4D2E] hover:underline cursor-pointer self-start sm:self-auto"
          >
            Switch to Class Cohort Timetable
          </button>
        </div>
      )}

      {/* ── Solver Diagnostics & Status Bar ── */}
      {!loading && diagnostics && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#E8E1D5] bg-[#FFFDF8] px-5 py-3 shadow-2xs text-xs text-[#75716B]">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isOptimalOrFeasible
                  ? 'bg-[#B9D9C2]/35 text-[#1B4D2E] border border-[#B9D9C2]/60'
                  : 'bg-[#F4DA69]/35 text-[#6B530E] border border-[#F4DA69]/60'
              }`}
            >
              {isOptimalOrFeasible ? (
                <CheckCircle2 size={13} />
              ) : (
                <AlertCircle size={13} />
              )}
              Solver: {timetableData?.schedule?.status}
            </span>
            <span className="text-[#D5CDBD]">•</span>
            <span>
              Scheduled:{' '}
              <strong className="text-[#1E1E1E] font-bold">
                {diagnostics.scheduled_count}/{diagnostics.total_sessions}
              </strong>{' '}
              sessions
            </span>
            <span className="text-[#D5CDBD]">•</span>
            <span>
              Solve Time:{' '}
              <strong className="text-[#1E1E1E] font-bold">
                {timetableData?.schedule?.solve_time_seconds != null
                  ? `${timetableData.schedule.solve_time_seconds.toFixed(1)}s`
                  : 'cached'}
              </strong>
            </span>
          </div>

          <div className="text-xs font-medium text-[#75716B]">
            {viewType === 'faculty' && activeFaculty ? (
              <>
                Active Faculty:{' '}
                <span className="font-bold text-[#1E1E1E]">
                  {activeFaculty.name} ({activeFaculty.department})
                </span>{' '}
                ({filteredSessions.length} sessions)
              </>
            ) : viewType === 'room' ? (
              <>
                Active Room / Venue:{' '}
                <span className="font-bold text-[#1E1E1E]">
                  {allRooms.find((r) => r.id === selectedRoomId)?.name ?? selectedRoomId} ({selectedRoomId})
                </span>{' '}
                ({filteredSessions.length} sessions)
              </>
            ) : (
              <>
                Active Cohort:{' '}
                <span className="font-bold text-[#1E1E1E]">
                  {department} ({semester} Sem{isYear1 ? ` · ${section}` : ''})
                </span>{' '}
                ({filteredSessions.length} sessions)
              </>
            )}
          </div>
        </div>
      )}

      {/* Solver Incomplete Notice */}
      {!loading && timetableData && !isOptimalOrFeasible && (
        <div className="rounded-[20px] border border-[#F4DA69]/60 bg-[#F4DA69]/20 p-4 text-xs text-[#6B530E] flex items-start gap-3 shadow-xs">
          <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-[#4A3805]">
              Solver generation did not complete successfully (Status: {timetableData.schedule.status})
            </p>
            <p className="text-[#6B530E]">
              {timetableData.schedule.message || 'The CP-SAT solver timed out before finding a feasible timetable.'}
              {' '}Click &ldquo;Regenerate&rdquo; above to re-run the solver with the full 120-second time limit.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <ErrorAlert message={error} onRetry={refetch} />
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] p-16 text-center shadow-xs">
          <LoadingSpinner message="Generating campus timetable with CP-SAT solver… Evaluating constraints for all 189 sessions (this may take up to 2 minutes)." />
        </div>
      )}

      {/* ── Timetable Presentation ── */}
      {!loading && !error && timetableData && (
        <div className="rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] shadow-xs overflow-hidden">
          {/* Empty sessions view */}
          {filteredSessions.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#FAF6ED] border border-[#E8E1D5] mx-auto flex items-center justify-center text-[#75716B] mb-3 shadow-2xs">
                <Calendar className="h-6 w-6 text-[#A39E95]" />
              </div>
              <h3 className="text-base font-bold text-[#1E1E1E]">
                {isFacultyFilterActive
                  ? `No scheduled teaching sessions found for ${activeFaculty?.name ?? 'this faculty member'}`
                  : `No scheduled sessions found for ${department} (${semester} Semester)`}
              </h3>
              <p className="text-xs text-[#75716B] mt-1.5 max-w-md mx-auto font-medium">
                {isFacultyFilterActive
                  ? 'This faculty member has no classroom teaching or lab sessions scheduled in the active timetable.'
                  : 'The dataset contains curriculum schedules for 1st Year (1st/2nd Sem), 2nd Year (3rd/4th Sem), and 3rd Year (5th/6th Sem). Please choose an active semester from the dropdown.'}
              </p>
              {isFacultyFilterActive && (
                <button
                  type="button"
                  onClick={handleClearFaculty}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#1E1E1E] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-black transition-colors cursor-pointer"
                >
                  View Cohort Timetable
                </button>
              )}
            </div>
          ) : viewMode === 'day' ? (
            /* ── MOBILE / SINGLE-DAY FOCUSED VIEW ── */
            <div className="p-4 sm:p-6 space-y-4">
              {/* Horizontal Day Selector Pill Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none select-none">
                {days.map((dayName, dIdx) => {
                  const isDayActive = mobileSelectedDay === dIdx;
                  const dayDate = weekDates[dIdx];
                  const dateStr = dayDate
                    ? `${dayDate.getDate()} ${dayDate.toLocaleDateString('en-US', { month: 'short' })}`
                    : '';
                  const count = daySessionsCount[dIdx] ?? 0;
                  const isToday = weekOffset === 0 && dIdx === todayDayIdx;

                  return (
                    <button
                      key={dayName}
                      type="button"
                      onClick={() => setMobileSelectedDay(dIdx)}
                      className={`flex flex-col items-center justify-center min-w-[84px] px-3 py-2.5 rounded-2xl transition-all cursor-pointer ${
                        isDayActive
                          ? 'bg-[#151515] text-white shadow-md'
                          : 'bg-[#FAF6ED]/70 border border-[#E8E1D5] text-[#1E1E1E] hover:bg-[#FAF6ED]'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold tracking-wider uppercase ${
                          isDayActive
                            ? 'text-[#E9A8CE]'
                            : isToday
                            ? 'text-[#E9A8CE]'
                            : 'text-[#75716B]'
                        }`}
                      >
                        {dayShort[dIdx]}
                      </span>
                      <span className="text-xs font-black mt-0.5">
                        {dateStr}
                      </span>
                      <span
                        className={`text-[9px] font-bold mt-1 px-1.5 py-0.2 rounded-full ${
                          isDayActive
                            ? 'bg-white/20 text-white'
                            : 'bg-white text-[#75716B] border border-[#E8E1D5]'
                        }`}
                      >
                        {count} {count === 1 ? 'class' : 'classes'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Day Header Info */}
              <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-2 pt-1">
                <div>
                  <h3 className="text-base font-extrabold text-[#1E1E1E]">
                    {days[mobileSelectedDay]} Schedule
                  </h3>
                  <p className="text-xs text-[#75716B] font-medium">
                    {activeDaySessions.length} session{activeDaySessions.length !== 1 ? 's' : ''} scheduled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className="text-xs font-bold text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-3 py-1 rounded-full hover:bg-[#F3EDE0] transition-colors cursor-pointer"
                >
                  Switch to 7-Day Grid
                </button>
              </div>

              {/* Day's Vertical Timeline List */}
              {activeDaySessions.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#A39E95] font-medium">
                  No classes scheduled on {days[mobileSelectedDay]}.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDaySessions.map((session) => {
                    const theme = pastelThemes[session.color];
                    const Icon = getSessionIcon(session.kind);

                    return (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        className={`rounded-[22px] border ${theme.border} ${theme.bg} p-4 transition-all cursor-pointer shadow-2xs hover:shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-white/80 border border-[#E8E1D5] text-[#1E1E1E]">
                              {session.code}
                            </span>
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                              {session.kind}
                            </span>
                            <span className="text-xs font-bold text-[#1E1E1E] flex items-center gap-1">
                              <Clock size={12} className="text-[#75716B]" />
                              {session.timeSlotString}
                            </span>
                          </div>

                          <h4 className="text-sm font-extrabold text-[#1E1E1E]">
                            {session.name}
                          </h4>

                          <div className="flex items-center gap-4 text-xs text-[#75716B] font-medium flex-wrap pt-0.5">
                            <span className="flex items-center gap-1 text-[#1E1E1E] font-semibold">
                              <MapPin size={13} className="text-[#A39E95]" />
                              {session.venue}
                            </span>
                            <span className="flex items-center gap-1">
                              <User size={13} className="text-[#A39E95]" />
                              {session.facultyName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users size={13} className="text-[#A39E95]" />
                              {session.groups.join(', ')} ({session.size} students)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                            <Icon size={17} />
                          </div>
                          <span className="text-xs font-bold bg-[#1E1E1E] text-white px-3 py-1.5 rounded-full">
                            Details
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ── DESKTOP & TABLET 7-DAY CALENDAR GRID (INTELLY STYLE) ── */
            <div className="overflow-x-auto w-full scrollbar-thin scrollbar-thumb-[#D5CDBD] scrollbar-track-transparent">
              <div
                className="grid min-w-[1240px] relative select-none"
                style={{
                  gridTemplateColumns: '76px repeat(7, minmax(160px, 1fr))',
                  gridTemplateRows: '58px repeat(10, minmax(98px, auto))',
                }}
              >
                {/* Top-Left Header: Time Axis Label */}
                <div className="sticky left-0 top-0 z-30 bg-[#FAF6ED] p-2 border-b border-r border-[#E8E1D5] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center">
                  <span className="text-[10px] font-extrabold text-[#A39E95] uppercase tracking-wider">
                    TIME
                  </span>
                  <span className="text-xs font-black text-[#1E1E1E]">
                    {weekOffset === 0 ? 'ACTIVE' : `W${weekOffset > 0 ? `+${weekOffset}` : weekOffset}`}
                  </span>
                </div>

                {/* Day Headers (7 Columns: MON to SUN) */}
                {days.map((dayName, dIdx) => {
                  const dayDate = weekDates[dIdx];
                  const dateStr = dayDate
                    ? `${dayDate.getDate()} ${dayDate.toLocaleDateString('en-US', { month: 'short' })}`
                    : '';
                  const isToday = weekOffset === 0 && dIdx === todayDayIdx;
                  const isWeekend = dIdx >= 5;

                  return (
                    <div
                      key={dayName}
                      style={{ gridColumn: dIdx + 2, gridRow: 1 }}
                      className="p-1.5 bg-[#FAF6ED] border-b border-r border-[#E8E1D5] last:border-r-0 flex items-center justify-center sticky top-0 z-20"
                    >
                      <div
                        className={`w-full h-full rounded-[16px] px-2 py-1.5 flex flex-col items-center justify-center transition-all ${
                          isToday
                            ? 'bg-[#151515] text-white shadow-xs'
                            : 'bg-[#FFFDF8] border border-[#E8E1D5]'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-black tracking-wider uppercase ${
                            isToday
                              ? 'text-[#E9A8CE]'
                              : isWeekend
                              ? 'text-[#C49B76]'
                              : 'text-[#75716B]'
                          }`}
                        >
                          {dayShort[dIdx]}
                        </span>
                        <span
                          className={`text-xs font-extrabold mt-0.5 ${
                            isToday ? 'text-white' : 'text-[#1E1E1E]'
                          }`}
                        >
                          {dateStr}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Left Column: Time Labels */}
                {timeSlots.map((time, rIdx) => {
                  const isLunch = rIdx === 5;
                  return (
                    <div
                      key={`time-${time}`}
                      style={{ gridColumn: 1, gridRow: rIdx + 2 }}
                      className={`sticky left-0 z-20 p-2 text-xs font-bold border-b border-r border-[#E8E1D5] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] flex flex-col items-center justify-start pt-3.5 transition-colors ${
                        isLunch ? 'text-[#6B530E] bg-[#FAF6ED]' : 'text-[#75716B] bg-[#FFFDF8]'
                      }`}
                    >
                      <span className="font-mono text-xs font-black">{time}</span>
                      <span className="text-[9px] font-bold text-[#A39E95] mt-0.5 tracking-tight">
                        {isLunch ? 'Lunch' : `P${rIdx < 5 ? rIdx + 1 : rIdx}`}
                      </span>
                    </div>
                  );
                })}

                {/* Grid Background Cells & Lunch Break Row */}
                {timeSlots.map((_, rIdx) =>
                  days.map((dayName, dIdx) => {
                    const isLunch = rIdx === 5;
                    const isWeekend = dIdx >= 5;

                    return (
                      <div
                        key={`cell-${dayName}-${rIdx}`}
                        style={{ gridColumn: dIdx + 2, gridRow: rIdx + 2 }}
                        className={`border-b border-r border-[#EFE8DA] last:border-r-0 p-1 min-h-[98px] transition-colors ${
                          isLunch
                            ? 'bg-[#FAF6ED]/60'
                            : isWeekend
                            ? 'bg-[#FAF6ED]/25'
                            : 'hover:bg-[#FAF6ED]/30'
                        }`}
                      >
                        {isLunch && (
                          <div className="h-full w-full rounded-xl border border-dashed border-[#E8E1D5] flex items-center justify-center text-[10px] font-bold text-[#A39E95] tracking-wider uppercase select-none">
                            Lunch Break
                          </div>
                        )}
                        {!isLunch && isWeekend && rIdx === 4 && (
                          <div className="h-full w-full flex items-center justify-center text-[10px] font-semibold text-[#C5BDB0] select-none">
                            Study &amp; Library Day
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Scheduled Session Blocks (Overlay on Calendar Grid) */}
                {filteredSessions.map((session) => {
                  const theme = pastelThemes[session.color];
                  const Icon = getSessionIcon(session.kind);
                  const colStart = session.day + 2;
                  const rowStart = session.startSlot + 2;
                  const facultyInitials = getFacultyInitials(session.facultyName);
                  const isMultiSlot = session.span > 1;

                  return (
                    <div
                      key={session.id}
                      style={{
                        gridColumn: colStart,
                        gridRow: `${rowStart} / span ${session.span}`,
                      }}
                      className="p-1 z-10"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSession(session)}
                        className={`w-full h-full text-left rounded-[18px] border ${theme.border} ${theme.bg} p-2.5 sm:p-3 cursor-pointer shadow-2xs hover:shadow-md hover:border-black/20 hover:scale-[1.01] transition-all flex flex-col justify-between group overflow-hidden`}
                      >
                        {/* Top Info Bar */}
                        <div className="space-y-1.5 w-full">
                          {/* Header Row: Course Code + Session Kind + Cohort Badge */}
                          <div className="flex items-center justify-between gap-1 w-full">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[11px] font-black text-[#151515] tracking-tight bg-white/80 border border-black/10 px-1.5 py-0.5 rounded-md shrink-0">
                                {session.code}
                              </span>
                              <span
                                className={`text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${theme.badgeBg} ${theme.badgeText}`}
                              >
                                {session.kind}
                              </span>
                              {session.hasConflict && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 animate-pulse">
                                  Conflict
                                </span>
                              )}
                            </div>

                            {/* Cohort Badge: Guaranteed visibility in top-right */}
                            <span
                              className="font-bold text-[9px] px-1.5 py-0.5 rounded-md bg-white/90 border border-black/10 text-[#1E1E1E] shadow-2xs shrink-0"
                              title={`Cohort: ${session.groups.join(', ')}`}
                            >
                              {session.groups[0] ?? ''}
                            </span>
                          </div>

                          {/* Course Title: Wrapped to 2 lines for readability */}
                          <h4
                            className="text-xs font-bold text-[#1E1E1E] line-clamp-2 leading-snug group-hover:text-black transition-colors"
                            title={session.name}
                          >
                            {session.name}
                          </h4>

                          {/* Venue Info */}
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#555]">
                            <MapPin size={11} className="shrink-0 text-[#888]" />
                            <span className="truncate" title={session.venue}>
                              {session.venue}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Metadata: Faculty Avatar, Initials, Name & Duration */}
                        <div className="mt-2 pt-1.5 border-t border-black/[0.06] flex items-center justify-between gap-1 w-full">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] shrink-0 shadow-2xs ${theme.avatarBg}`}
                              title={session.facultyName}
                            >
                              {facultyInitials}
                            </div>
                            <span
                              className="font-medium text-[#666] truncate text-[10px]"
                              title={session.facultyName}
                            >
                              {session.facultyName}
                            </span>
                          </div>

                          {isMultiSlot ? (
                            <span
                              className="text-[9px] font-bold text-[#555] bg-white/80 border border-black/10 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1"
                              title={`${session.span} hours duration`}
                            >
                              <Clock size={9} />
                              {session.span}h
                            </span>
                          ) : (
                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 opacity-70 group-hover:opacity-100 transition-opacity ${theme.iconBg}`}
                            >
                              <Icon size={9} />
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Session Detail Modal (Intelly Style) ── */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-[28px] bg-[#FFFDF8] p-6 shadow-2xl border border-[#E8E1D5] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D5] pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-[#FAF6ED] border border-[#E8E1D5] text-[#1E1E1E]">
                    {selectedSession.code}
                  </span>
                  <span
                    className={`text-xs uppercase font-extrabold px-2.5 py-0.5 rounded-full capitalize ${
                      pastelThemes[selectedSession.color].badgeBg
                    } ${pastelThemes[selectedSession.color].badgeText}`}
                  >
                    {selectedSession.kind}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-[#1E1E1E] mt-1.5 leading-snug">
                  {selectedSession.name}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                aria-label="Close details"
                className="rounded-full p-1.5 text-[#75716B] hover:text-[#1E1E1E] hover:bg-[#FAF6ED] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Details Grid */}
            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5]">
                <MapPin size={16} className="text-[#A39E95] shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                    Venue Location
                  </span>
                  <span className="font-bold text-[#1E1E1E]">{selectedSession.venue}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5]">
                <User size={16} className="text-[#A39E95] shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                    Assigned Faculty Instructor
                  </span>
                  <span className="font-bold text-[#1E1E1E]">
                    {selectedSession.facultyName}{' '}
                    <span className="text-xs text-[#75716B] font-medium">
                      ({selectedSession.facultyId})
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5]">
                <Clock size={16} className="text-[#A39E95] shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                    Scheduled Day &amp; Time
                  </span>
                  <span className="font-bold text-[#1E1E1E]">
                    {days[selectedSession.day]} · {selectedSession.timeSlotString}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5]">
                <Users size={16} className="text-[#A39E95] shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                    Target Student Cohort
                  </span>
                  <span className="font-bold text-[#1E1E1E]">
                    {selectedSession.groups.join(', ')} ({selectedSession.size} enrolled students)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5]">
                <CalendarDays size={16} className="text-[#A39E95] shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                    Session Reference ID
                  </span>
                  <span className="font-mono text-xs font-bold text-[#1E1E1E]">
                    {selectedSession.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#E8E1D5] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-full bg-[#1E1E1E] hover:bg-black text-white px-5 py-2 text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}