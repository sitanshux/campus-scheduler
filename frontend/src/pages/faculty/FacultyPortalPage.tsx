import { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  ArrowRightLeft,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  Send,
  Info,
  BookOpen,
  MapPin,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  Users,
  Monitor,
  CalendarDays,
  Filter,
  RefreshCw,
} from 'lucide-react';
import type { FacultyPageId, ScheduledSession, Faculty } from '../../types';
import { useApi } from '../../hooks/useApi';
import { fetchFaculty, fetchFullTimetableData, fetchRooms, requestAiReschedule, explainDecisionAi, proposeReschedule } from '../../services/api';
import type { RescheduleProposal } from '../../types';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorAlert from '../../components/ui/ErrorAlert';
import StatCard from '../../components/dashboard/StatCard';

interface FacultyPortalPageProps {
  activeTab?: FacultyPageId;
  onTabChange?: (tab: FacultyPageId) => void;
  selectedFacultyId?: string;
  onFacultyChange?: (facultyId: string) => void;
  facultyList?: Faculty[];
}

const TAB_CONFIG = [
  { id: 'faculty-overview' as FacultyPageId, label: 'My Overview', icon: User },
  { id: 'faculty-timetable' as FacultyPageId, label: 'Personal Timetable', icon: Calendar },
  { id: 'faculty-unavailability' as FacultyPageId, label: 'Mark Unavailability', icon: Clock },
  { id: 'faculty-sessions' as FacultyPageId, label: 'Session Requests', icon: ArrowRightLeft },
  { id: 'faculty-ai' as FacultyPageId, label: 'AI Schedule Assistant', icon: Bot },
];

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayShort = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const timeSlots = [
  '08:00', // Slot 0 -> Period 1
  '09:00', // Slot 1 -> Period 2
  '10:00', // Slot 2 -> Period 3
  '11:00', // Slot 3 -> Period 4
  '12:00', // Slot 4 -> Period 5
  '13:00', // Slot 5 -> Lunch Break
  '14:00', // Slot 6 -> Period 6
  '15:00', // Slot 7 -> Period 7
  '16:00', // Slot 8 -> Period 8
  '17:00', // Slot 9 -> Period 9
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

const PERIOD_TIME_STRINGS: Record<number, string> = {
  1: '08:00 ΓÇô 09:00',
  2: '09:00 ΓÇô 10:00',
  3: '10:00 ΓÇô 11:00',
  4: '11:00 ΓÇô 12:00',
  5: '12:00 ΓÇô 13:00',
  6: '14:00 ΓÇô 15:00',
  7: '15:00 ΓÇô 16:00',
  8: '16:00 ΓÇô 17:00',
  9: '17:00 ΓÇô 18:00',
};

export type SessionKindColor = 'yellow' | 'blue' | 'lavender' | 'green' | 'pink';

interface FacultyTimetableBlock {
  id: string;
  code: string;
  name: string;
  venue: string;
  day: number;
  startSlot: number;
  span: number;
  color: SessionKindColor;
  kind: string;
  groups: string[];
  period: number;
  timeSlotString: string;
  size: number;
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
  },
  blue: {
    bg: 'bg-[#F0F5FC]',
    border: 'border-[#C8DAF2]',
    badgeBg: 'bg-[#B8CDEB]/40',
    badgeText: 'text-[#1E3A5F]',
    text: 'text-[#1A314E]',
    subText: 'text-[#486382]',
    iconBg: 'bg-[#B8CDEB]/50 text-[#1E3A5F]',
  },
  lavender: {
    bg: 'bg-[#F4F3FD]',
    border: 'border-[#CFCCF7]',
    badgeBg: 'bg-[#B9B5F4]/40',
    badgeText: 'text-[#3E3882]',
    text: 'text-[#2E2963]',
    subText: 'text-[#5C5599]',
    iconBg: 'bg-[#B9B5F4]/50 text-[#3E3882]',
  },
  green: {
    bg: 'bg-[#F2F8F4]',
    border: 'border-[#C7E3CE]',
    badgeBg: 'bg-[#B9D9C2]/45',
    badgeText: 'text-[#194E2C]',
    text: 'text-[#153D23]',
    subText: 'text-[#426E50]',
    iconBg: 'bg-[#B9D9C2]/50 text-[#194E2C]',
  },
  pink: {
    bg: 'bg-[#FCF2F7]',
    border: 'border-[#F3C4DF]',
    badgeBg: 'bg-[#E9A8CE]/35',
    badgeText: 'text-[#732450]',
    text: 'text-[#541A3B]',
    subText: 'text-[#874A6E]',
    iconBg: 'bg-[#E9A8CE]/50 text-[#732450]',
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

function periodToStartSlot(period: number): number {
  if (period <= 5) {
    return period - 1;
  }
  return period;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

let chatMsgSeq = 100;
function makeMessage(sender: 'user' | 'assistant', text: string): ChatMessage {
  chatMsgSeq += 1;
  return {
    id: `msg-${chatMsgSeq}`,
    sender,
    text,
    timestamp: 'Sent',
  };
}

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'assistant',
    text: 'Hello Professor! I am your CIT Scheduling Assistant. I can help inspect your scheduled teaching periods, check available laboratory slots, review daily teaching limits, and evaluate schedule adjustments. (Note: AI natural language backend integration is currently in prototype mode; responses below demonstrate conversational schedule assistance.)',
    timestamp: '09:00 AM',
  },
];

// Sample faculty session requests for preview
interface FacultySessionRequest {
  id: string;
  type: 'extra_class' | 'reschedule';
  courseId: string;
  courseTitle: string;
  cohort: string;
  requestedSlot: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'alternative_offered';
  decisionNote?: string;
  submittedAt: string;
}

const INITIAL_FACULTY_REQUESTS: FacultySessionRequest[] = [
  {
    id: 'REQ-FAC-01',
    type: 'extra_class',
    courseId: 'CS301',
    courseTitle: 'Data Structures & Algorithms',
    cohort: 'CSE-2',
    requestedSlot: 'FRI Period 7 (15:00 ΓÇô 16:00)',
    reason: 'Remedial session on balanced search trees for mid-term exam review.',
    status: 'approved',
    decisionNote: 'Approved: Venue LH-101 allocated; zero student cohort collisions.',
    submittedAt: 'Yesterday, 11:20',
  },
  {
    id: 'REQ-FAC-02',
    type: 'reschedule',
    courseId: 'CS303',
    courseTitle: 'Operating Systems Lab',
    cohort: 'CSE-2',
    requestedSlot: 'THU Period 6ΓÇô7 ΓåÆ FRI Period 6ΓÇô7',
    reason: 'Conference duty on Thursday afternoon.',
    status: 'pending',
    decisionNote: 'Under Department Coordinator review; preliminary room check indicates CS-LAB-1 is free.',
    submittedAt: 'Today, 08:45',
  },
  {
    id: 'REQ-FAC-03',
    type: 'extra_class',
    courseId: 'CS305',
    courseTitle: 'Database Systems',
    cohort: 'CSE-3',
    requestedSlot: 'WED Period 9 (17:00 ΓÇô 18:00)',
    reason: 'Guest speaker Q&A extension.',
    status: 'alternative_offered',
    decisionNote: 'LH-101 is occupied. Alternative slot offered: THU Period 8 in LH-102.',
    submittedAt: '3 days ago',
  },
];

const fetchTimetableData = () => fetchFullTimetableData(120);

export default function FacultyPortalPage({
  activeTab = 'faculty-overview',
  onTabChange,
  selectedFacultyId: controlledFacultyId,
  onFacultyChange,
  facultyList: controlledFacultyList,
}: FacultyPortalPageProps) {
  const [internalFacultyId, setInternalFacultyId] = useState('F01');
  const selectedFacultyId = controlledFacultyId ?? internalFacultyId;

  // Timetable view states
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [mobileSelectedDay, setMobileSelectedDay] = useState<number>(0);
  const [selectedSessionModal, setSelectedSessionModal] = useState<FacultyTimetableBlock | null>(null);

  // Form states for Unavailability
  const [unavailDay, setUnavailDay] = useState('WED');
  const [unavailStartPeriod, setUnavailStartPeriod] = useState('6');
  const [unavailEndPeriod, setUnavailEndPeriod] = useState('9');
  const [unavailReason, setUnavailReason] = useState('Department committee meeting');

  // Form states for Extra Session
  const [extraCourse, setExtraCourse] = useState('');
  const [extraGroup, setExtraGroup] = useState('CSE-2');
  const [extraType, setExtraType] = useState('lecture');
  const [extraDay, setExtraDay] = useState('FRI');
  const [extraPeriod, setExtraPeriod] = useState('8');
  const [extraReason, setExtraReason] = useState('Mid-semester syllabus catch-up');

  // Form states for Session Change
  const [changeSessionId, setChangeSessionId] = useState('');
  const [changeTargetDay, setChangeTargetDay] = useState('THU');
  const [changeTargetPeriod, setChangeTargetPeriod] = useState('4');
  const [changeReason, setChangeReason] = useState('Medical appointment');

  // AI Assistant Chat State
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [inputPrompt, setInputPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [sessionRequestLoading, setSessionRequestLoading] = useState(false);
  const [sessionProposalNotice, setSessionProposalNotice] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
    proposalId?: string;
    details?: string;
  } | null>(null);

  // Live data hooks
  const { data: fetchedFacultyList } = useApi(fetchFaculty);
  const facultyList = controlledFacultyList ?? fetchedFacultyList;
  const { data: timetableData, loading: timetableLoading, error: timetableError, refetch: refetchTimetable } = useApi(
    fetchTimetableData
  );
  const { data: roomsData } = useApi(fetchRooms);

  const handleTabClick = (tab: FacultyPageId) => {
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const selectedFaculty: Faculty | undefined = useMemo(() => {
    if (!facultyList) return undefined;
    return facultyList.find((f) => f.id === selectedFacultyId) ?? facultyList[0];
  }, [facultyList, selectedFacultyId]);

  // Personal scheduled sessions from solver
  const personalSessions: ScheduledSession[] = useMemo(() => {
    if (!timetableData?.schedule?.scheduled || !selectedFaculty) return [];
    return timetableData.schedule.scheduled.filter(
      (s) => s.faculty_id === selectedFaculty.id
    );
  }, [timetableData, selectedFaculty]);

  // Weekly hours calculated
  const totalWeeklyHours = useMemo(() => {
    return personalSessions.reduce((acc, s) => acc + s.duration, 0);
  }, [personalSessions]);

  const coursesTaught = useMemo(() => {
    if (!timetableData?.dataset?.courses) return [];
    const courseIds = new Set(personalSessions.map((s) => s.course_id));
    return timetableData.dataset.courses.filter((c) => courseIds.has(c.id));
  }, [timetableData, personalSessions]);

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

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
      return `${startMonth} ${startDay} ΓÇô ${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} ΓÇô ${endMonth} ${endDay}, ${year}`;
  }, [monday, weekDates]);

  // Map personal sessions into calendar blocks
  const mappedPersonalBlocks = useMemo<FacultyTimetableBlock[]>(() => {
    if (!timetableData?.dataset || personalSessions.length === 0) return [];
    const courseMap = new Map(timetableData.dataset.courses.map((c) => [c.id, c]));
    const roomMap = new Map((roomsData ?? timetableData.dataset.rooms).map((r) => [r.id, r]));

    return personalSessions.map((s) => {
      const course = courseMap.get(s.course_id);
      const room = roomMap.get(s.room_id);
      const dayIdx = DAY_INDEX[s.day] ?? 0;
      const startSlot = periodToStartSlot(s.period);
      const venueName = room ? `${room.name} (${s.room_id})` : s.room_id;
      const timeStr = PERIOD_TIME_STRINGS[s.period] ?? `Period ${s.period}`;

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
        groups: s.groups,
        period: s.period,
        timeSlotString: `${timeStr} (Period ${s.period}${s.duration > 1 ? `ΓÇô${s.period + s.duration - 1}` : ''})`,
        size: s.size,
      };
    });
  }, [personalSessions, timetableData, roomsData]);

  const daySessionsCount = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const s of mappedPersonalBlocks) {
      counts[s.day] = (counts[s.day] || 0) + 1;
    }
    return counts;
  }, [mappedPersonalBlocks]);

  const activeDaySessions = useMemo(() => {
    return mappedPersonalBlocks
      .filter((s) => s.day === mobileSelectedDay)
      .sort((a, b) => a.startSlot - b.startSlot);
  }, [mappedPersonalBlocks, mobileSelectedDay]);

    const [lastProposal, setLastProposal] = useState<RescheduleProposal | null>(null);

  const handleSendPrompt = async (promptText?: string) => {
    const textToSend = promptText || inputPrompt;
    if (!textToSend.trim() || aiLoading) return;

    const userMsg = makeMessage('user', textToSend);
    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setAiLoading(true);

    try {
      const lower = textToSend.toLowerCase();
      const isReschedule =
        lower.includes('move') ||
        lower.includes('reschedule') ||
        lower.includes('cancel') ||
        lower.includes('add') ||
        lower.includes('remedial') ||
        lower.includes('extra') ||
        lower.includes('shift') ||
        lower.includes('swap') ||
        lower.includes('leave');

      if (isReschedule) {
        const proposal = await requestAiReschedule(textToSend);
        setLastProposal(proposal);
        let reply = `✨ **Gemini & CP-SAT Rescheduling Proposal**\n\n`;
        reply += `• **Proposal ID:** \`${proposal.proposal_id}\`\n`;
        reply += `• **Feasibility:** **${proposal.status.toUpperCase()}** (${proposal.solver_status})\n`;
        reply += `• **Solver Summary:** ${proposal.changes.length} change(s) — Frozen: ${proposal.frozen_count}, Moved: ${proposal.moved_count}, Added: ${proposal.added_count}, Unscheduled: ${proposal.unscheduled_count}\n`;
        reply += `• **Solve Time:** ${proposal.solve_time_seconds.toFixed(2)}s\n\n`;

        if (proposal.changes && proposal.changes.length > 0) {
          reply += `**Detailed Changes:**\n`;
          for (const ch of proposal.changes) {
            const fromStr = ch.before ? `${ch.before.day} P${ch.before.period} (${ch.before.room_id})` : 'Unassigned';
            const toStr = ch.after ? `${ch.after.day} P${ch.after.period} (${ch.after.room_id})` : 'Unscheduled';
            reply += `- Session \`${ch.session_id}\` [${ch.kind.toUpperCase()}]: ${fromStr} ➔ ${toStr}${ch.reason ? ` — ${ch.reason}` : ''}\n`;
          }
        }
        if (proposal.conflicts && proposal.conflicts.length > 0) {
          reply += `\n⚠️ **Detected Conflicts:** ${proposal.conflicts.join('; ')}\n`;
        }
        reply += `\n*Note: Evaluated by CP-SAT solver. Admin approval workflow required before the timetable is altered.*`;

        const assistantMsg = makeMessage('assistant', reply);
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const explanation = await explainDecisionAi('schedule', {
          faculty_id: selectedFaculty?.id ?? 'F01',
          faculty_name: selectedFaculty?.name ?? 'Faculty',
          department: selectedFaculty?.department ?? 'CSE',
          weekly_hours: totalWeeklyHours,
          daily_limit: selectedFaculty?.max_hours_per_day ?? 4,
          query: textToSend,
        });

        const assistantMsg = makeMessage('assistant', explanation.explanation || 'Processed query with backend scheduling engine.');
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: unknown) {
      console.warn('AI backend call error, falling back to local analysis:', err);
      let fallbackText = `⚠️ **Backend Notice**: Real-time Gemini LLM query could not be completed (${err instanceof Error ? err.message : 'API offline'}).\n\n`;
      fallbackText += `**Schedule Metrics for ${selectedFaculty?.name ?? 'Faculty'}**:\n`;
      if (textToSend.toLowerCase().includes('free') || textToSend.toLowerCase().includes('slots')) {
        fallbackText += `• Current teaching load: ${totalWeeklyHours} hours/week against daily limit of ${selectedFaculty?.max_hours_per_day ?? 4}h.\n• Tuesday and Thursday afternoon periods 6–7 are free from teaching commitments.`;
      } else if (textToSend.toLowerCase().includes('lab') || textToSend.toLowerCase().includes('room')) {
        fallbackText += `• Computing Lab 1 (CS-LAB-1) is dedicated to curriculum lab blocks during academic periods.\n• Friday period 7–8 is recommended for makeup practical sessions.`;
      } else {
        fallbackText += `• Assigned sessions: ${personalSessions.length} weekly blocks.\n• Unavailability rules recorded: ${(selectedFaculty?.unavailable ?? []).length}.`;
      }
      const assistantMsg = makeMessage('assistant', fallbackText);
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleRequestExtraSession = async () => {
    if (!extraCourse) {
      setSessionProposalNotice({
        type: 'warning',
        message: 'Please select a course for the extra session.',
      });
      return;
    }
    setSessionRequestLoading(true);
    setSessionProposalNotice(null);
    try {
      const groups = personalSessions.find((s) => s.course_id === extraCourse)?.groups || [extraGroup];
      const proposal = await proposeReschedule({
        description: `Extra class for ${extraCourse} on ${extraDay} P${extraPeriod}: ${extraReason || 'Remedial session'}`,
        changes: [
          {
            type: 'add_session',
            session: {
              session_id: `EXTRA-${extraCourse}-${Date.now().toString().slice(-4)}`,
              course_id: extraCourse,
              kind: extraType,
              groups: groups,
              faculty_id: selectedFaculty?.id ?? 'F01',
              day: extraDay,
              period: parseInt(extraPeriod, 10),
              duration: 1,
              room_id: 'LH-101',
              size: 60,
            },
          },
        ],
      });
      setLastProposal(proposal);
      setSessionProposalNotice({
        type: proposal.status === 'feasible' ? 'success' : 'warning',
        message: `CP-SAT Proposal Generated (${proposal.status.toUpperCase()}): Proposal ID ${proposal.proposal_id}`,
        proposalId: proposal.proposal_id,
        details: `${proposal.changes.length} change(s) evaluated by CP-SAT solver in ${proposal.solve_time_seconds.toFixed(2)}s. Status: ${proposal.solver_status}. Awaiting Admin Approval workflow.`,
      });
    } catch (err: unknown) {
      setSessionProposalNotice({
        type: 'warning',
        message: 'Proposal Generation Notice',
        details: err instanceof Error ? err.message : 'Backend solver offline or request rejected.',
      });
    } finally {
      setSessionRequestLoading(false);
    }
  };

  const handleProposeSessionMove = async () => {
    if (!changeSessionId) {
      setSessionProposalNotice({
        type: 'warning',
        message: 'Please select a scheduled session to move.',
      });
      return;
    }
    setSessionRequestLoading(true);
    setSessionProposalNotice(null);
    try {
      const sessionToMove = personalSessions.find((s) => s.session_id === changeSessionId);
      const proposal = await proposeReschedule({
        description: `Move session ${changeSessionId} to ${changeTargetDay} P${changeTargetPeriod}: ${changeReason || 'Faculty request'}`,
        changes: [
          {
            type: 'add_session',
            session: {
              session_id: changeSessionId,
              course_id: sessionToMove?.course_id || 'CS301',
              kind: sessionToMove?.kind || 'lecture',
              groups: sessionToMove?.groups || ['CSE-1'],
              faculty_id: selectedFaculty?.id ?? 'F01',
              day: changeTargetDay,
              period: parseInt(changeTargetPeriod, 10),
              duration: sessionToMove?.duration || 1,
              room_id: sessionToMove?.room_id || 'LH-101',
              size: sessionToMove?.size || 60,
            },
          },
        ],
      });
      setLastProposal(proposal);
      setSessionProposalNotice({
        type: proposal.status === 'feasible' ? 'success' : 'warning',
        message: `CP-SAT Rescheduling Proposal (${proposal.status.toUpperCase()}): Proposal ID ${proposal.proposal_id}`,
        proposalId: proposal.proposal_id,
        details: `${proposal.changes.length} change(s) computed by CP-SAT solver. Frozen: ${proposal.frozen_count}, Moves: ${proposal.moved_count}. Submitted to Admin Approval workflow.`,
      });
    } catch (err: unknown) {
      setSessionProposalNotice({
        type: 'warning',
        message: 'Rescheduling Proposal Notice',
        details: err instanceof Error ? err.message : 'Backend solver returned an error or is unreachable.',
      });
    } finally {
      setSessionRequestLoading(false);
    }
  };

    const currentTab = activeTab;

  return (
    <div className="space-y-6">
      {/* ΓöÇΓöÇ Faculty Top Header Card (Intelly Style) ΓöÇΓöÇ */}
      <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          {/* Identity & Scope Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] text-white px-3.5 py-1 text-xs font-bold shadow-2xs">
              <User size={13} className="text-[#E9A8CE]" />
              Faculty Member Portal
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] px-3 py-1 text-xs font-bold text-[#1E1E1E]">
              ID: {selectedFaculty?.id ?? 'F01'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E9A8CE]/20 text-[#7A1F52] border border-[#E9A8CE]/40 px-2.5 py-1 text-xs font-bold">
              Dept: {selectedFaculty?.department ?? 'CSE'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4DA69]/30 border border-[#F4DA69]/60 text-[#6B530E] px-2.5 py-1 text-xs font-bold">
              ΓÜí Dev Preview
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#1E1E1E] tracking-tight mt-2.5">
            Welcome, {selectedFaculty ? selectedFaculty.name : 'Faculty Member'}
          </h1>

          <p className="text-xs sm:text-sm text-[#75716B] font-medium mt-1 max-w-2xl">
            {selectedFaculty
              ? `Department of ${selectedFaculty.department} ΓÇó Max Teaching Load: ${selectedFaculty.max_hours_per_day}h/day ΓÇó ${personalSessions.length} weekly sessions assigned.`
              : 'View and manage personal academic timetable, unavailability constraints, and session requests.'}
          </p>
        </div>

        {/* Dev Preview Switcher (Intelly Pill Dropdown) */}
        <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="faculty-select" className="text-xs font-bold text-[#75716B] whitespace-nowrap">
              Switch Faculty:
            </label>
            <div className="relative">
              <select
                id="faculty-select"
                value={selectedFacultyId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setInternalFacultyId(newId);
                  onFacultyChange?.(newId);
                }}
                className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 pr-9 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none hover:bg-white transition-colors cursor-pointer"
                title="Switch active faculty profile in Dev Preview"
              >
                {facultyList?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.department} - {f.id})
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#75716B] pointer-events-none" />
            </div>
          </div>
          <p className="text-[11px] text-[#A39E95] font-medium">
            Profile &amp; TopBar synchronize dynamically.
          </p>
        </div>
      </div>

      {/* ΓöÇΓöÇ Faculty Role Navigation Pill Tabs ΓöÇΓöÇ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'bg-[#FFFDF8] text-[#75716B] border border-[#E8E1D5] hover:text-[#1E1E1E] hover:bg-[#FAF6ED]'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-[#E9A8CE]' : 'text-[#A39E95]'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 1: My Overview ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'faculty-overview' && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Assigned Courses"
              value={timetableLoading ? 'ΓÇª' : coursesTaught.length}
              icon={BookOpen}
              trend={timetableLoading ? 'CP-SAT solver running' : `${coursesTaught.length} active subjects`}
              color="blue"
            />
            <StatCard
              title="Weekly Sessions"
              value={timetableLoading ? 'ΓÇª' : personalSessions.length}
              icon={Calendar}
              trend={timetableLoading ? 'Evaluating constraints' : `${totalWeeklyHours} total teaching hours`}
              color="yellow"
            />
            <StatCard
              title="Daily Teaching Limit"
              value={`${selectedFaculty?.max_hours_per_day ?? 4} hrs`}
              icon={Clock}
              trend="CP-SAT daily constraint"
              color="lavender"
            />
            <StatCard
              title="Recorded Unavailability"
              value={selectedFaculty?.unavailable?.length ?? 0}
              icon={AlertCircle}
              trend={selectedFaculty?.unavailable?.length ? `${selectedFaculty.unavailable.length} period windows` : 'Full availability'}
              color="rose"
            />
          </div>

          {/* Quick Action Navigation Strip */}
          <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-4 shadow-xs flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs font-extrabold text-[#1E1E1E]">Faculty Shortcuts:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleTabClick('faculty-timetable')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] text-xs font-bold text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
              >
                <Calendar size={13} className="text-[#E9A8CE]" />
                <span>View Full Timetable</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('faculty-unavailability')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] text-xs font-bold text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
              >
                <Clock size={13} className="text-[#6B530E]" />
                <span>Mark Unavailability</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('faculty-sessions')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] text-xs font-bold text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
              >
                <ArrowRightLeft size={13} className="text-[#1E4378]" />
                <span>Request Extra Class</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('faculty-ai')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] text-xs font-bold text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
              >
                <Bot size={13} className="text-[#3C367C]" />
                <span>Ask AI Assistant</span>
              </button>
            </div>
          </div>

          {/* Overview Content Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Courses & Modules Panel */}
            <div className="rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D5]">
                <h3 className="font-extrabold text-[#1E1E1E] text-sm flex items-center gap-2">
                  <BookOpen size={16} className="text-[#1E4378]" />
                  <span>Assigned Courses &amp; Modules</span>
                </h3>
                <span className="text-xs font-bold text-[#75716B] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full">
                  {coursesTaught.length} courses
                </span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {coursesTaught.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED]/50 text-xs hover:bg-[#FAF6ED] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-[#1E1E1E] bg-white border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                        {c.id}
                      </span>
                      <span className="text-[10px] font-bold text-[#75716B] bg-white border border-[#E8E1D5] px-2 py-0.5 rounded-full">
                        Year {c.year}
                      </span>
                    </div>
                    <p className="font-extrabold text-[#1E1E1E] mt-1.5">{c.title}</p>
                    <p className="text-[11px] text-[#75716B] font-medium mt-1">
                      Curriculum Load: {c.lecture_hours}L / {c.tutorial_hours}T / {c.lab_blocks} Practical Labs
                    </p>
                  </div>
                ))}
                {coursesTaught.length === 0 && (
                  <p className="text-xs text-[#A39E95] py-8 text-center font-medium">
                    No curriculum courses directly mapped to this faculty.
                  </p>
                )}
              </div>
            </div>

            {/* Upcoming Teaching Sessions Panel */}
            <div className="lg:col-span-2 rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D5]">
                <h3 className="font-extrabold text-[#1E1E1E] text-sm flex items-center gap-2">
                  <Calendar size={16} className="text-[#6B530E]" />
                  <span>Assigned Teaching Sessions ({personalSessions.length})</span>
                </h3>
                <button
                  onClick={() => handleTabClick('faculty-timetable')}
                  className="text-xs text-[#1E1E1E] font-bold hover:underline cursor-pointer"
                >
                  View Full Calendar ΓåÆ
                </button>
              </div>

              {timetableLoading ? (
                <div className="py-12">
                  <LoadingSpinner message="Evaluating personal teaching sessionsΓÇª" />
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {mappedPersonalBlocks.map((s) => {
                    const theme = pastelThemes[s.color];
                    const Icon = getSessionIcon(s.kind);

                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSessionModal(s)}
                        className={`p-3.5 rounded-2xl border ${theme.border} ${theme.bg} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer shadow-2xs hover:shadow-md transition-all`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-[#1E1E1E] bg-white border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                              {dayShort[s.day]} ΓÇó P{s.period}
                            </span>
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                              {s.kind}
                            </span>
                            <span className="text-xs font-bold text-[#1E1E1E] flex items-center gap-1">
                              <Clock size={12} className="text-[#75716B]" />
                              {s.timeSlotString.split('(')[0].trim()}
                            </span>
                          </div>

                          <h4 className="text-sm font-extrabold text-[#1E1E1E] truncate">
                            {s.code} ΓÇö {s.name}
                          </h4>

                          <div className="flex items-center gap-4 text-xs text-[#75716B] font-medium flex-wrap pt-0.5">
                            <span className="flex items-center gap-1 text-[#1E1E1E] font-semibold">
                              <MapPin size={12} className="text-[#A39E95]" />
                              {s.venue}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users size={12} className="text-[#A39E95]" />
                              {s.groups.join(', ')} ({s.size} students)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                            <Icon size={16} />
                          </div>
                          <span className="text-xs font-bold bg-[#151515] text-white px-3 py-1.5 rounded-full">
                            Details
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {personalSessions.length === 0 && (
                    <p className="text-xs text-[#A39E95] py-12 text-center font-medium">
                      No teaching sessions assigned to this faculty member in the active timetable.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 2: Personal Timetable (Intelly 7-Day Calendar) ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'faculty-timetable' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Week Navigator */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center bg-[#FAF6ED] border border-[#E8E1D5] rounded-full p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setWeekOffset((prev) => prev - 1)}
                  aria-label="Previous week"
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
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#75716B] hover:bg-white hover:text-[#1E1E1E] transition-colors cursor-pointer"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Day / Week Switcher */}
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

            {/* Right: Summary & Refresh */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-[#75716B] font-medium">
                Teaching: <strong className="text-[#1E1E1E] font-bold">{personalSessions.length} sessions</strong> ({totalWeeklyHours} hrs/week)
              </span>
              <button
                type="button"
                onClick={() => refetchTimetable()}
                disabled={timetableLoading}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-3.5 py-1.5 rounded-full hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={timetableLoading ? 'animate-spin text-[#E9A8CE]' : 'text-[#75716B]'} />
                <span>{timetableLoading ? 'SolvingΓÇª' : 'Refresh Schedule'}</span>
              </button>
            </div>
          </div>

          {/* Timetable Presentation */}
          {timetableLoading ? (
            <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-16 shadow-xs text-center">
              <LoadingSpinner message="Generating faculty timetable with CP-SAT solverΓÇª Evaluating curriculum constraints." />
            </div>
          ) : timetableError ? (
            <ErrorAlert message={timetableError} onRetry={refetchTimetable} />
          ) : (
            <div className="rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] shadow-xs overflow-hidden">
              {personalSessions.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#FAF6ED] border border-[#E8E1D5] mx-auto flex items-center justify-center text-[#75716B] mb-3 shadow-2xs">
                    <Calendar className="h-6 w-6 text-[#A39E95]" />
                  </div>
                  <h3 className="text-base font-bold text-[#1E1E1E]">
                    No teaching sessions scheduled for {selectedFaculty?.name}
                  </h3>
                  <p className="text-xs text-[#75716B] mt-1.5 max-w-md mx-auto font-medium">
                    This faculty member has no teaching sessions assigned in the active semester solver run.
                  </p>
                </div>
              ) : viewMode === 'day' ? (
                /* ΓöÇΓöÇ MOBILE / SINGLE-DAY FOCUSED VIEW ΓöÇΓöÇ */
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
                      No teaching sessions scheduled on {days[mobileSelectedDay]}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeDaySessions.map((session) => {
                        const theme = pastelThemes[session.color];
                        const Icon = getSessionIcon(session.kind);

                        return (
                          <div
                            key={session.id}
                            onClick={() => setSelectedSessionModal(session)}
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
                /* ΓöÇΓöÇ DESKTOP & TABLET 7-DAY CALENDAR GRID ΓöÇΓöÇ */
                <div className="overflow-x-auto w-full scrollbar-thin scrollbar-thumb-[#D5CDBD] scrollbar-track-transparent">
                  <div
                    className="grid min-w-[1240px] relative select-none"
                    style={{
                      gridTemplateColumns: '76px repeat(7, minmax(160px, 1fr))',
                      gridTemplateRows: '58px repeat(10, minmax(98px, auto))',
                    }}
                  >
                    {/* Top-Left Header */}
                    <div className="sticky left-0 top-0 z-30 bg-[#FAF6ED] p-2 border-b border-r border-[#E8E1D5] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center">
                      <span className="text-[10px] font-extrabold text-[#A39E95] uppercase tracking-wider">
                        HOURS
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

                    {/* Grid Background Cells */}
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
                                Research &amp; Prep Day
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Scheduled Personal Session Blocks */}
                    {mappedPersonalBlocks.map((session) => {
                      const theme = pastelThemes[session.color];
                      const Icon = getSessionIcon(session.kind);
                      const colStart = session.day + 2;
                      const rowStart = session.startSlot + 2;
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
                            onClick={() => setSelectedSessionModal(session)}
                            className={`w-full h-full text-left rounded-[18px] border ${theme.border} ${theme.bg} p-2.5 sm:p-3 cursor-pointer shadow-2xs hover:shadow-md hover:border-black/20 hover:scale-[1.01] transition-all flex flex-col justify-between group overflow-hidden`}
                          >
                            {/* Top Info Bar */}
                            <div className="space-y-1.5 w-full">
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
                                </div>

                                <span
                                  className="font-bold text-[9px] px-1.5 py-0.5 rounded-md bg-white/90 border border-black/10 text-[#1E1E1E] shadow-2xs shrink-0"
                                  title={`Cohort: ${session.groups.join(', ')}`}
                                >
                                  {session.groups[0] ?? ''}
                                </span>
                              </div>

                              <h4
                                className="text-xs font-bold text-[#1E1E1E] line-clamp-2 leading-snug group-hover:text-black transition-colors"
                                title={session.name}
                              >
                                {session.name}
                              </h4>

                              <div className="flex items-center gap-1 text-[11px] font-semibold text-[#555]">
                                <MapPin size={11} className="shrink-0 text-[#888]" />
                                <span className="truncate" title={session.venue}>
                                  {session.venue}
                                </span>
                              </div>
                            </div>

                            {/* Bottom Metadata */}
                            <div className="mt-2 pt-1.5 border-t border-black/[0.06] flex items-center justify-between gap-1 w-full">
                              <div className="flex items-center gap-1 text-[10px] text-[#555] font-semibold">
                                <Clock size={10} className="text-[#888]" />
                                <span>Period {session.period}{session.span > 1 ? `ΓÇô${session.period + session.span - 1}` : ''}</span>
                              </div>

                              {isMultiSlot ? (
                                <span
                                  className="text-[9px] font-bold text-[#555] bg-white/80 border border-black/10 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1"
                                  title={`${session.span} hours duration`}
                                >
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
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 3: Mark Unavailability ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'faculty-unavailability' && (
        <div className="space-y-6">
          {/* Notice Banner */}
          <div className="flex items-start gap-3 p-4 rounded-[22px] bg-[#FDF8E2] border border-[#F4DA69]/70 text-xs text-[#6B530E] shadow-xs">
            <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                Notice: Faculty Unavailability Persistence API Pending Backend Implementation
              </p>
              <p className="text-[#6B530E] font-medium leading-relaxed">
                Faculty members can specify windows when they are unavailable for classroom teaching due to official academic commitments, research conferences, or administrative duties. Existing constraints below are actively enforced by the CP-SAT solver. New entries will be wired to the solver database once the write API endpoint is deployed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Current Registered Unavailability */}
            <div className="lg:col-span-6 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#1E1E1E]">
                    Current Registered Unavailability
                  </h3>
                  <p className="text-xs text-[#75716B] font-medium mt-0.5">
                    Constraints currently enforced for {selectedFaculty?.name}.
                  </p>
                </div>
                <span className="text-xs font-bold bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-1 rounded-full text-[#1E1E1E]">
                  {selectedFaculty?.unavailable?.length ?? 0} windows
                </span>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {selectedFaculty?.unavailable?.map((u, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED]/50 text-xs space-y-1.5 hover:bg-[#FAF6ED] transition-colors"
                  >
                    <div className="flex items-center justify-between font-bold text-[#1E1E1E]">
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-[#6B530E]" />
                        <span>Day: {u.day}</span>
                      </span>
                      <span className="rounded-full bg-[#FCF2F7] text-[#7A1F52] border border-[#E9A8CE] px-2.5 py-0.5 text-[10px] font-extrabold">
                        Periods: [{u.periods.join(', ')}]
                      </span>
                    </div>
                    <p className="text-[#75716B] font-medium">
                      <strong className="text-[#1E1E1E]">Reason:</strong> {u.reason}
                    </p>
                  </div>
                ))}
                {(!selectedFaculty?.unavailable || selectedFaculty.unavailable.length === 0) && (
                  <div className="py-12 text-center text-xs text-[#A39E95] font-medium">
                    No unavailability constraints recorded for this faculty member. Available across all periods MondayΓÇôFriday.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Mark Additional Window Form */}
            <div className="lg:col-span-6 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="border-b border-[#E8E1D5] pb-3">
                <h3 className="text-base font-extrabold text-[#1E1E1E]">
                  Mark Additional Unavailable Window
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Declare unavailability for future CP-SAT timetable solver runs.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Day of Week</label>
                  <select
                    value={unavailDay}
                    onChange={(e) => setUnavailDay(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    <option value="MON">Monday</option>
                    <option value="TUE">Tuesday</option>
                    <option value="WED">Wednesday</option>
                    <option value="THU">Thursday</option>
                    <option value="FRI">Friday</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">From Period</label>
                    <select
                      value={unavailStartPeriod}
                      onChange={(e) => setUnavailStartPeriod(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                        <option key={p} value={p}>
                          Period {p} ({PERIOD_TIME_STRINGS[p]?.split('ΓÇô')[0]?.trim()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">To Period</label>
                    <select
                      value={unavailEndPeriod}
                      onChange={(e) => setUnavailEndPeriod(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                        <option key={p} value={p}>
                          Period {p} ({PERIOD_TIME_STRINGS[p]?.split('ΓÇô')[1]?.trim()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Unavailability Reason</label>
                  <input
                    type="text"
                    value={unavailReason}
                    onChange={(e) => setUnavailReason(e.target.value)}
                    placeholder="e.g. Research conference, Board meeting, Academic duty..."
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8E1D5] space-y-2">
                <button
                  type="button"
                  disabled
                  title="Unavailability write endpoint is pending backend deployment. Interface preview."
                  className="w-full rounded-full bg-[#151515] px-4 py-2.5 text-xs font-bold text-white shadow-2xs opacity-60 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Clock size={13} />
                  <span>Save Unavailability (Pending Backend API)</span>
                </button>
                <p className="text-[11px] text-[#A39E95] text-center font-medium">
                  Preview interface only. Submissions will be wired to solver database upon endpoint completion.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 4: Session Requests ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'faculty-sessions' && (
        <div className="space-y-6">
          {/* Notice Banner */}
          <div className="flex items-start gap-3 p-4 rounded-[22px] bg-[#FDF8E2] border border-[#F4DA69]/70 text-xs text-[#6B530E] shadow-xs">
            <Sparkles size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                CP-SAT Rescheduling &amp; Session Proposals Active
              </p>
              <p className="text-[#6B530E] font-medium leading-relaxed">
                Extra lecture requests and schedule swaps are verified by the automated solver via <code>POST /api/reschedule/propose</code> against cohort conflict rules, room occupancy limits, and faculty daily hour caps before submitting to the Admin approval workflow.
              </p>
            </div>
          </div>

          {/* Real Backend Proposal Feedback Banner */}
          {sessionProposalNotice && (
            <div
              className={`rounded-[22px] border p-4 text-xs flex items-start justify-between gap-3 shadow-xs ${
                sessionProposalNotice.type === 'success'
                  ? 'border-[#B9D9C2]/80 bg-[#E8F4EC] text-[#1F5433]'
                  : sessionProposalNotice.type === 'warning'
                  ? 'border-[#F4DA69]/80 bg-[#FDF8E2] text-[#6B530E]'
                  : 'border-[#B8CDEB]/80 bg-[#EDF3FB] text-[#24426E]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Sparkles size={16} className="shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-extrabold">{sessionProposalNotice.message}</p>
                  {sessionProposalNotice.details && (
                    <p className="font-medium leading-relaxed">{sessionProposalNotice.details}</p>
                  )}
                  {lastProposal && (
                    <div className="mt-2 text-[11px] font-mono bg-white/70 p-2 rounded-xl border border-current/20">
                      Proposal: {lastProposal.proposal_id} | Status: {lastProposal.status} | Changes: {lastProposal.changes.length} | Frozen: {lastProposal.frozen_count}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSessionProposalNotice(null)}
                className="p-1 rounded-full hover:bg-black/5 text-[#75716B] hover:text-[#1E1E1E] cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Request Extra Class */}
            <div className="lg:col-span-6 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="border-b border-[#E8E1D5] pb-3">
                <h3 className="text-base font-extrabold text-[#1E1E1E]">
                  Request Extra / Remedial Class
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Propose an additional classroom or lab session for syllabus catch-up.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Course</label>
                  <select
                    value={extraCourse}
                    onChange={(e) => setExtraCourse(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    <option value="">Select Course Offering</option>
                    {coursesTaught.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} ΓÇö {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Student Cohort</label>
                    <select
                      value={extraGroup}
                      onChange={(e) => setExtraGroup(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      <option value="CSE-2">CSE-2 (2nd Year)</option>
                      <option value="CSE-3">CSE-3 (3rd Year)</option>
                      <option value="Y1-A">Y1-A (1st Year Sec A)</option>
                      <option value="ECE-2">ECE-2 (2nd Year)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Session Type</label>
                    <select
                      value={extraType}
                      onChange={(e) => setExtraType(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      <option value="lecture">Lecture (Theory)</option>
                      <option value="lab">Lab / Practical</option>
                      <option value="tutorial">Tutorial</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Preferred Day</label>
                    <select
                      value={extraDay}
                      onChange={(e) => setExtraDay(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      <option value="MON">Monday</option>
                      <option value="TUE">Tuesday</option>
                      <option value="WED">Wednesday</option>
                      <option value="THU">Thursday</option>
                      <option value="FRI">Friday</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Preferred Period</label>
                    <select
                      value={extraPeriod}
                      onChange={(e) => setExtraPeriod(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      {[6, 7, 8, 9].map((p) => (
                        <option key={p} value={p}>
                          Period {p} ({PERIOD_TIME_STRINGS[p]})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Justification</label>
                  <input
                    type="text"
                    value={extraReason}
                    onChange={(e) => setExtraReason(e.target.value)}
                    placeholder="e.g. Remedial lab, Exam preparation..."
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8E1D5] space-y-2">
                <button
                  type="button"
                  onClick={handleRequestExtraSession}
                  disabled={sessionRequestLoading}
                  className="w-full rounded-full bg-[#151515] hover:bg-[#333] px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sessionRequestLoading ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-[#E9A8CE]" />
                      <span>Computing Proposal via CP-SAT...</span>
                    </>
                  ) : (
                    <>
                      <Calendar size={13} className="text-[#E9A8CE]" />
                      <span>Request Extra Session (CP-SAT Solver)</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-[#A39E95] text-center font-medium">
                  Preview interface only. Data will be dispatched to Coordinator inbox upon API completion.
                </p>
              </div>
            </div>

            {/* Right: Propose Session Reschedule / Swap */}
            <div className="lg:col-span-6 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="border-b border-[#E8E1D5] pb-3">
                <h3 className="text-base font-extrabold text-[#1E1E1E]">
                  Propose Session Move / Swap
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Propose moving an existing class to an alternative time slot.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Current Session to Move</label>
                  <select
                    value={changeSessionId}
                    onChange={(e) => setChangeSessionId(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    <option value="">Select Existing Scheduled Session</option>
                    {personalSessions.map((s) => (
                      <option key={s.session_id} value={s.session_id}>
                        {s.course_id} on {s.day} P{s.period} ({s.groups.join(', ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Target Day</label>
                    <select
                      value={changeTargetDay}
                      onChange={(e) => setChangeTargetDay(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      <option value="MON">Monday</option>
                      <option value="TUE">Tuesday</option>
                      <option value="WED">Wednesday</option>
                      <option value="THU">Thursday</option>
                      <option value="FRI">Friday</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Target Period</label>
                    <select
                      value={changeTargetPeriod}
                      onChange={(e) => setChangeTargetPeriod(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                        <option key={p} value={p}>
                          Period {p} ({PERIOD_TIME_STRINGS[p]})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Reason for Move</label>
                  <input
                    type="text"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="e.g. Conference overlap, Guest talk conflict..."
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8E1D5] space-y-2">
                <button
                  type="button"
                  onClick={handleProposeSessionMove}
                  disabled={sessionRequestLoading}
                  className="w-full rounded-full bg-[#151515] hover:bg-[#333] px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sessionRequestLoading ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-[#E9A8CE]" />
                      <span>Computing Proposal via CP-SAT...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft size={13} className="text-[#E9A8CE]" />
                      <span>Propose Session Move (CP-SAT Solver)</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-[#A39E95] text-center font-medium">
                  Preview interface only. Proposals require Coordinator verification against CP-SAT constraints.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom: Recent Session Requests Log */}
          <div className="rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#1E1E1E]">
                  Recent Session Requests &amp; Status
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Track coordinator review decisions and solver feedback.
                </p>
              </div>
              <span className="text-xs font-bold bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-1 rounded-full text-[#1E1E1E]">
                {INITIAL_FACULTY_REQUESTS.length} requests
              </span>
            </div>

            <div className="space-y-3">
              {INITIAL_FACULTY_REQUESTS.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 space-y-2 hover:bg-[#FAF6ED] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#1E1E1E] bg-white border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                          {req.id}
                        </span>
                        <span className="font-extrabold text-xs text-[#1E1E1E]">
                          {req.courseId} ΓÇö {req.courseTitle}
                        </span>
                        <span className="text-[10px] text-[#A39E95] font-semibold">
                          ΓÇó {req.submittedAt}
                        </span>
                      </div>
                      <p className="text-xs text-[#75716B] font-medium mt-0.5">
                        Cohort: <strong>{req.cohort}</strong> ΓÇó Requested Window: {req.requestedSlot}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                        req.status === 'approved'
                          ? 'bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2]'
                          : req.status === 'alternative_offered'
                          ? 'bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB]'
                          : req.status === 'rejected'
                          ? 'bg-[#FCF2F7] text-[#7A1F52] border border-[#E9A8CE]'
                          : 'bg-[#FDF8E2] text-[#6B530E] border border-[#F4DA69]'
                      }`}
                    >
                      {req.status === 'approved' && <CheckCircle2 size={11} />}
                      {req.status === 'rejected' && <XCircle size={11} />}
                      {req.status === 'pending' && <Clock size={11} />}
                      {req.status === 'alternative_offered' && <ArrowRightLeft size={11} />}
                      {req.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-[#75716B] font-medium">
                    <strong className="text-[#1E1E1E]">Justification:</strong> {req.reason}
                  </p>

                  {req.decisionNote && (
                    <div className="p-2 rounded-xl bg-white border border-[#E8E1D5] text-[11px] text-[#1E1E1E] font-medium flex items-start gap-1.5">
                      <Info size={13} className="text-[#A39E95] shrink-0 mt-0.5" />
                      <span><strong>Coordinator Feedback:</strong> {req.decisionNote}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 5: AI Schedule Assistant Interface ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'faculty-ai' && (
        <div className="rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-5">
          {/* Notice Banner */}
          <div className="flex items-start gap-3 p-4 rounded-[22px] bg-[#FDF8E2] border border-[#F4DA69]/70 text-xs text-[#6B530E] shadow-xs">
            <Sparkles size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                Gemini AI Schedule Assistant &amp; CP-SAT Rescheduling Active
              </p>
              <p className="text-[#6B530E] font-medium leading-relaxed">
                Directly connected to backend Gemini AI and CP-SAT solver endpoints (<code>/api/ai/reschedule-request</code>, <code>/api/ai/explain</code>). Ask to move classes, request remedial slots, or query lecture conflicts — changes generate solver-verified proposals for Admin approval.
              </p>
            </div>
          </div>

          {/* Quick Query Suggestion Chips */}
          <div>
            <p className="text-xs font-bold text-[#75716B] mb-2.5">Suggested prompt queries:</p>
            <div className="flex flex-wrap gap-2">
              {[
                'Find my free periods on Tuesday and Thursday',
                'Can I schedule a 1-hour remedial lecture for CSE-2 on Friday Period 7?',
                'Is CS-LAB-1 available for extra practicals tomorrow afternoon?',
                `Summarize my weekly teaching load against the ${selectedFaculty?.max_hours_per_day ?? 4}h daily limit`,
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSendPrompt(chip)}
                  className="rounded-full bg-[#FAF6ED] hover:bg-[#F3EDE0] border border-[#E8E1D5] text-[#1E1E1E] px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer text-left shadow-2xs flex items-center gap-1.5"
                >
                  <Sparkles size={11} className="text-[#E9A8CE]" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Conversational Chat Window */}
          <div className="border border-[#E8E1D5] rounded-[24px] h-96 flex flex-col bg-[#FAF6ED]/40 overflow-hidden shadow-2xs">
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-[20px] px-4 py-3 text-xs shadow-xs ${
                      m.sender === 'user'
                        ? 'bg-[#151515] text-white rounded-br-xs'
                        : 'bg-[#FFFDF8] text-[#1E1E1E] border border-[#E8E1D5] rounded-bl-xs'
                    }`}
                  >
                    <p className="leading-relaxed font-medium">{m.text}</p>
                    <span
                      className={`block text-[10px] mt-1.5 text-right font-semibold ${
                        m.sender === 'user' ? 'text-white/60' : 'text-[#A39E95]'
                      }`}
                    >
                      {m.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {aiLoading && (
              <div className="px-4 py-2 bg-[#FDF8E2] border-t border-[#F4DA69]/60 flex items-center gap-2 text-xs text-[#6B530E] font-medium animate-pulse">
                <RefreshCw size={12} className="animate-spin text-[#6B530E]" />
                <span>Consulting Gemini LLM &amp; CP-SAT rescheduling engine...</span>
              </div>
            )}
            {/* Input Bar */}
            <div className="p-3.5 bg-[#FFFDF8] border-t border-[#E8E1D5] flex items-center gap-2">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendPrompt();
                }}
                placeholder="Ask about your schedule, free slots, or venue availability..."
                className="flex-1 text-xs rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2.5 text-[#1E1E1E] font-medium focus:outline-none focus:border-[#E9A8CE]"
              />
              <button
                type="button"
                onClick={() => handleSendPrompt()}
                disabled={!inputPrompt.trim()}
                className="rounded-full bg-[#151515] px-4 py-2.5 text-white hover:bg-black disabled:opacity-40 transition-colors cursor-pointer shadow-xs flex items-center justify-center shrink-0"
              >
                <Send size={14} className="text-[#E9A8CE]" />
              </button>
            </div>
          </div>
        
          {/* Before/After Timetable Comparison Card for Last Proposal */}
          {lastProposal && (
            <div className="rounded-[24px] border border-[#B9D9C2] bg-[#FFFDF8] p-5 shadow-xs space-y-3.5 animate-in fade-in mt-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-[#E8E1D5]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-[#FAF6ED] border border-[#E8E1D5] text-[#1E1E1E]">
                    Proposal ID: {lastProposal.proposal_id}
                  </span>
                  <span className="rounded-full bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2] px-2.5 py-0.5 text-xs font-extrabold uppercase">
                    {lastProposal.status} ({lastProposal.solver_status})
                  </span>
                </div>
                <span className="text-xs text-[#75716B] font-semibold">
                  Solved in {lastProposal.solve_time_seconds.toFixed(2)}s • {lastProposal.moved_count} moved, {lastProposal.frozen_count} frozen
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="text-xs font-extrabold text-[#1E1E1E] uppercase tracking-wider">
                  Before vs. After Timetable Comparison
                </h4>
                <p className="text-xs text-[#75716B] font-medium">
                  Optimal timetable perturbation calculated by CP-SAT solver with minimal moves ({lastProposal.moved_count} moved, {lastProposal.frozen_count} frozen).
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAF6ED] border-b border-[#E8E1D5] text-[#75716B] uppercase font-bold text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Session</th>
                      <th className="px-3 py-2">Before (Original)</th>
                      <th className="px-3 py-2">After (Proposed)</th>
                      <th className="px-3 py-2">Action / Kind</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE8DA]">
                    {lastProposal.changes.map((ch, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF6ED]/50">
                        <td className="px-3 py-2.5 font-mono font-bold text-[#1E1E1E]">
                          {ch.session_id}
                        </td>
                        <td className="px-3 py-2.5">
                          {ch.before ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF6ED] border border-[#E8E1D5] px-2 py-0.5 font-semibold text-[#75716B]">
                              {ch.before.day} Period {ch.before.period} • {ch.before.room_id}
                            </span>
                          ) : (
                            <span className="text-xs text-[#A39E95] italic">New Session</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {ch.after ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF5ED] border border-[#B9D9C2] px-2 py-0.5 font-bold text-[#1E5C32]">
                              {ch.after.day} Period {ch.after.period} • {ch.after.room_id}
                            </span>
                          ) : (
                            <span className="text-xs text-rose-600 italic">Unscheduled</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-full bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB] px-2 py-0.5 text-[10px] font-extrabold uppercase">
                            {ch.kind}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-2xl bg-[#FDF8E2] border border-[#F4DA69]/60 text-xs text-[#6B530E] flex items-center justify-between">
                <span>
                  <strong>Status:</strong> Queued for Administrator review. Requires Admin approval before timetable reflects changes.
                </span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ΓöÇΓöÇ Interactive Session Details Modal ΓöÇΓöÇ */}
      {selectedSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-[28px] bg-[#FFFDF8] p-6 shadow-2xl border border-[#E8E1D5] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D5] pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-[#FAF6ED] border border-[#E8E1D5] text-[#1E1E1E]">
                    {selectedSessionModal.code}
                  </span>
                  <span
                    className={`text-xs uppercase font-extrabold px-2.5 py-0.5 rounded-full capitalize ${
                      pastelThemes[selectedSessionModal.color].badgeBg
                    } ${pastelThemes[selectedSessionModal.color].badgeText}`}
                  >
                    {selectedSessionModal.kind}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-[#1E1E1E] mt-1.5 leading-snug">
                  {selectedSessionModal.name}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSessionModal(null)}
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
                  <span className="font-bold text-[#1E1E1E]">{selectedSessionModal.venue}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5]">
                <Clock size={16} className="text-[#A39E95] shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                    Scheduled Day &amp; Time
                  </span>
                  <span className="font-bold text-[#1E1E1E]">
                    {days[selectedSessionModal.day]} ┬╖ {selectedSessionModal.timeSlotString}
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
                    {selectedSessionModal.groups.join(', ')} ({selectedSessionModal.size} enrolled students)
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
                    {selectedSessionModal.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#E8E1D5] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSessionModal(null)}
                className="rounded-full bg-[#151515] hover:bg-black text-white px-5 py-2 text-xs font-bold shadow-xs transition-colors cursor-pointer"
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