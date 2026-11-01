import { useState, useMemo } from 'react';
import {
  Building2,
  Calendar,
  ArrowRightLeft,
  CalendarPlus,
  CalendarCheck,
  Users,
  DoorOpen,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Filter,
  RefreshCw,
  Clock,
  MapPin,
  X,
  Info,
} from 'lucide-react';
import type { CoordinatorPageId, ProcessedBooking, ScheduledSession } from '../../types';
import { useApi } from '../../hooks/useApi';
import {
  fetchDatasetFull,
  fetchFullTimetableData,
  fetchFullBookings,
} from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorAlert from '../../components/ui/ErrorAlert';
import StatCard from '../../components/dashboard/StatCard';

interface CoordinatorDashboardPageProps {
  activeTab?: CoordinatorPageId;
  onTabChange?: (tab: CoordinatorPageId) => void;
  selectedDepartment?: string;
  onDepartmentChange?: (dept: string) => void;
}

const DEPARTMENTS = [
  { id: 'CSE', name: 'Computer Science & Engineering' },
  { id: 'ECE', name: 'Electronics & Communication Engineering' },
  { id: 'EE', name: 'Electrical Engineering' },
  { id: 'ME', name: 'Mechanical Engineering' },
  { id: 'CE', name: 'Civil Engineering' },
];

const TAB_CONFIG = [
  { id: 'coordinator-overview' as CoordinatorPageId, label: 'Department Overview', icon: Building2 },
  { id: 'coordinator-timetable' as CoordinatorPageId, label: 'Department Timetable', icon: Calendar },
  { id: 'coordinator-sessions' as CoordinatorPageId, label: 'Session Changes', icon: ArrowRightLeft },
  { id: 'coordinator-bookings' as CoordinatorPageId, label: 'Department Bookings', icon: CalendarPlus },
  { id: 'coordinator-approvals' as CoordinatorPageId, label: 'Lab Booking Approvals', icon: CalendarCheck },
];

const DAY_ORDER: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
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

// Proposals interface for session change log
interface SessionProposalRecord {
  id: string;
  courseId: string;
  courseTitle: string;
  currentSlot: string;
  proposedSlot: string;
  venue: string;
  facultyName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'alternative_offered';
  decisionNote?: string;
  submittedAt: string;
}

// Initial realistic department proposals for preview
const INITIAL_PROPOSALS: SessionProposalRecord[] = [
  {
    id: 'PROP-2026-01',
    courseId: 'CS301',
    courseTitle: 'Data Structures & Algorithms',
    currentSlot: 'MON Period 2 (09:00 ΓÇô 10:00)',
    proposedSlot: 'WED Period 3 (10:00 ΓÇô 11:00)',
    venue: 'LH-101',
    facultyName: 'Dr. Sandeep Patnaik',
    reason: 'Faculty attending ACM Distinguished Lecture on Monday morning.',
    status: 'approved',
    decisionNote: 'Solver verified: 0 student collisions for CSE-2. Venue LH-101 allocated.',
    submittedAt: 'Yesterday, 14:30',
  },
  {
    id: 'PROP-2026-02',
    courseId: 'CS303',
    courseTitle: 'Operating Systems Lab',
    currentSlot: 'THU Period 6ΓÇô7 (14:00 ΓÇô 16:00)',
    proposedSlot: 'FRI Period 6ΓÇô7 (14:00 ΓÇô 16:00)',
    venue: 'CS-LAB-1',
    facultyName: 'Dr. Kavya Iyer',
    reason: 'System software patch maintenance scheduled for Thursday afternoon.',
    status: 'pending',
    decisionNote: 'Under Admin Review. Preliminary CP-SAT constraint check shows slot available.',
    submittedAt: 'Today, 09:15',
  },
  {
    id: 'PROP-2026-03',
    courseId: 'CS305',
    courseTitle: 'Database Management Systems',
    currentSlot: 'TUE Period 4 (11:00 ΓÇô 12:00)',
    proposedSlot: 'THU Period 4 (11:00 ΓÇô 12:00)',
    venue: 'LH-102',
    facultyName: 'Dr. Ananya Mishra',
    reason: 'Department curriculum board meeting conflict.',
    status: 'alternative_offered',
    decisionNote: 'LH-102 occupied by EC301. Alternative slot offered: THU Period 5 in LH-101.',
    submittedAt: '2 days ago',
  },
  {
    id: 'PROP-2026-04',
    courseId: 'CS302',
    courseTitle: 'Computer System Architecture',
    currentSlot: 'WED Period 1 (08:00 ΓÇô 09:00)',
    proposedSlot: 'MON Period 5 (12:00 ΓÇô 13:00)',
    venue: 'LH-101',
    facultyName: 'Dr. Rajesh Sharma',
    reason: 'Requested move to midday slot.',
    status: 'rejected',
    decisionNote: 'Hard constraint violation: Period 5 overlaps with cohort remedial tutorials.',
    submittedAt: '3 days ago',
  },
];

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

const fetchTimetableData = () => fetchFullTimetableData(120);

export default function CoordinatorDashboardPage({
  activeTab = 'coordinator-overview',
  onTabChange,
  selectedDepartment: propDepartment,
  onDepartmentChange,
}: CoordinatorDashboardPageProps) {
  const [internalDepartment, setInternalDepartment] = useState('CSE');
  const department = propDepartment ?? internalDepartment;

  const handleDepartmentChange = (newDept: string) => {
    setInternalDepartment(newDept);
    onDepartmentChange?.(newDept);
  };

  const [selectedSemester, setSelectedSemester] = useState('All');

  // Form states for Session Change Request
  const [changeCourse, setChangeCourse] = useState('CS301');
  const [changeSessionId, setChangeSessionId] = useState('');
  const [changeTargetDay, setChangeTargetDay] = useState('WED');
  const [changeTargetPeriod, setChangeTargetPeriod] = useState('3');
  const [changeReason, setChangeReason] = useState('Faculty academic duty');

  // Form states for Event Booking
  const [eventTitle, setEventTitle] = useState('');
  const [eventCategory, setEventCategory] = useState<
    'guest_lecture' | 'department_event' | 'workshop' | 'seminar'
  >('department_event');
  const [eventVenue, setEventVenue] = useState('CS-LAB-1');
  const [eventAttendance, setEventAttendance] = useState('60');
  const [eventDay, setEventDay] = useState('FRI');
  const [eventPeriod, setEventPeriod] = useState('7');

  // Confirmation Dialog State for Lab Approval Action
  const [selectedBookingForDecision, setSelectedBookingForDecision] = useState<ProcessedBooking | null>(null);
  const [decisionActionType, setDecisionActionType] = useState<'approve' | 'reject'>('approve');
  const [decisionNotes, setDecisionNotes] = useState('');

  // Fast, direct dataset loading for immediate overview metrics & entities
  const {
    data: fullDataset,
    loading: datasetLoading,
    error: datasetError,
    refetch: refetchDataset,
  } = useApi(fetchDatasetFull);

  // Timetable solver loading
  const {
    data: timetableData,
    loading: timetableLoading,
    error: timetableError,
    refetch: refetchTimetable,
  } = useApi(fetchTimetableData);

  // Full bookings with solver conflict decisions
  const {
    data: bookingsData,
    loading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useApi(fetchFullBookings);

  const handleTabClick = (tab: CoordinatorPageId) => {
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Filter department faculty from full dataset
  const deptFaculty = useMemo(() => {
    if (!fullDataset?.faculty) return [];
    return fullDataset.faculty.filter((f) => f.department === department);
  }, [fullDataset, department]);

  // Filter department courses from full dataset
  const deptCourses = useMemo(() => {
    if (!fullDataset?.courses) return [];
    return fullDataset.courses.filter((c) => c.department === department);
  }, [fullDataset, department]);

  // Filter department student groups from full dataset
  const deptGroups = useMemo(() => {
    if (!fullDataset?.student_groups) return [];
    return fullDataset.student_groups.filter(
      (g) => g.department === department || g.id.startsWith(department)
    );
  }, [fullDataset, department]);

  // Filter scheduled sessions for this department
  const deptSessions = useMemo(() => {
    if (!timetableData?.schedule?.scheduled) return [];
    const deptCourseIds = new Set(deptCourses.map((c) => c.id));
    return timetableData.schedule.scheduled.filter((s) => deptCourseIds.has(s.course_id));
  }, [timetableData, deptCourses]);

  // Filter department labs from full dataset rooms
  const deptLabs = useMemo(() => {
    if (!fullDataset?.rooms) return [];
    if (department === 'CSE') {
      return fullDataset.rooms.filter((r) => r.type === 'lab_cs' || r.id.startsWith('CS-'));
    }
    if (department === 'ECE' || department === 'EE') {
      return fullDataset.rooms.filter((r) => r.type === 'lab_elec' || r.id.startsWith('ELEC-'));
    }
    if (department === 'CE') {
      return fullDataset.rooms.filter((r) => r.type === 'lab_civil');
    }
    if (department === 'ME') {
      return fullDataset.rooms.filter((r) => r.type === 'workshop');
    }
    return fullDataset.rooms.filter((r) => r.type.includes('lab'));
  }, [fullDataset, department]);

  // Filter bookings for departmental events belonging to this department (Tab 4: Department Bookings)
  const deptEventBookings = useMemo(() => {
    if (!bookingsData?.bookings) return [];
    return bookingsData.bookings.filter((b) => {
      // Must be an event organized for or by this department
      if (b.department === department) {
        return true;
      }
      if (b.role === 'department_coordinator' && b.department === department) {
        return true;
      }
      return false;
    });
  }, [bookingsData, department]);

  // Filter requests targeting laboratories/facilities owned by this department (Tab 5: Lab Booking Approvals)
  const deptLabApprovals = useMemo(() => {
    if (!bookingsData?.bookings) return [];
    const labIds = new Set<string>(deptLabs.map((l) => l.id));
    const deptLabTypes = new Set<string>(deptLabs.map((l) => l.type));

    return bookingsData.bookings.filter((b) => {
      // 1. Specifically requested a laboratory owned by this department
      if (b.requested_room && labIds.has(b.requested_room)) {
        return true;
      }
      // 2. Allocated to a laboratory owned by this department
      if (b.allocated?.room_id && labIds.has(b.allocated.room_id)) {
        return true;
      }
      // 3. Alternative room offered is a laboratory owned by this department
      if (b.alternative?.room_id && labIds.has(b.alternative.room_id)) {
        return true;
      }
      // 4. Requested room types match this department's laboratory types (e.g. lab_cs for CSE, lab_elec for ECE)
      if (b.room_types && b.room_types.some((rt) => deptLabTypes.has(rt))) {
        return true;
      }
      return false;
    });
  }, [bookingsData, deptLabs]);

  // Filter timetable sessions by semester
  const filteredTimetableSessions = useMemo(() => {
    if (!deptSessions) return [];
    let list = deptSessions;
    if (selectedSemester === '3rd') {
      list = deptSessions.filter((s) =>
        s.groups.some((g) => g.includes('2') || g === `${department}-2`)
      );
    } else if (selectedSemester === '5th') {
      list = deptSessions.filter((s) =>
        s.groups.some((g) => g.includes('3') || g === `${department}-3`)
      );
    } else if (selectedSemester === '1st') {
      list = deptSessions.filter((s) => s.groups.some((g) => g.startsWith('Y1')));
    }

    // Sort chronologically: Day -> Period -> Course ID
    return [...list].sort((a, b) => {
      const dayDiff = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99);
      if (dayDiff !== 0) return dayDiff;
      if (a.period !== b.period) return a.period - b.period;
      return a.course_id.localeCompare(b.course_id);
    });
  }, [deptSessions, selectedSemester, department]);

  const currentTab = activeTab;

  const handleOpenDecisionDialog = (booking: ProcessedBooking, action: 'approve' | 'reject') => {
    setSelectedBookingForDecision(booking);
    setDecisionActionType(action);
    setDecisionNotes(
      action === 'approve'
        ? `Approved for departmental facility utilization. Verified zero conflict with ${department} curriculum lab sessions.`
        : `Request rejected due to high department lab utilization and scheduled laboratory maintenance.`
    );
  };

  const handleCloseDecisionDialog = () => {
    setSelectedBookingForDecision(null);
  };

  return (
    <div className="space-y-6">

      {/* ΓöÇΓöÇ Coordinator Top Header Card (Intelly Style) ΓöÇΓöÇ */}
      <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          {/* Identity & Scope Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] text-white px-3 py-1 text-xs font-bold shadow-2xs">
              <Building2 size={13} className="text-[#E9A8CE]" />
              Department Coordinator
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] px-3 py-1 text-xs font-bold text-[#1E1E1E]">
              Dr. Ananya Mishra
              <span className="text-[#75716B] font-semibold">(Assigned: CSE)</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4DA69]/30 border border-[#F4DA69]/60 text-[#6B530E] px-2.5 py-1 text-xs font-bold">
              ΓÜí Dev Preview
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#1E1E1E] tracking-tight mt-2.5">
            {DEPARTMENTS.find((d) => d.id === department)?.name ?? department}
          </h1>

          <p className="text-xs sm:text-sm text-[#75716B] font-medium mt-1 max-w-2xl">
            {department === 'CSE'
              ? 'Home Department: Managing curriculum timetable, session proposals, and laboratory approvals for Computer Science & Engineering.'
              : `Cross-Department Preview: Reviewing curriculum metrics and lab facilities for ${DEPARTMENTS.find((d) => d.id === department)?.name} (${department}).`}
          </p>
        </div>

        {/* Dev Scope Switcher (Intelly Pill Dropdown) */}
        <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="dept-select" className="text-xs font-bold text-[#75716B] whitespace-nowrap">
              Dev Scope:
            </label>
            <div className="relative">
              <select
                id="dept-select"
                value={department}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 pr-9 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none hover:bg-white transition-colors cursor-pointer"
                title="In production, coordinators are restricted to their assigned department. Cross-department switching is available in Dev Preview mode only."
              >
                <option value="CSE">
                  CSE ΓÇö Computer Science (Assigned)
                </option>
                <optgroup label="Cross-Department Preview (Dev Mode)">
                  {DEPARTMENTS.filter((d) => d.id !== 'CSE').map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.id} ΓÇö {dept.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#75716B] pointer-events-none" />
            </div>
          </div>
          <p className="text-[11px] text-[#A39E95] font-medium">
            Production mode strictly restricts access to CSE.
          </p>
        </div>
      </div>

      {/* ΓöÇΓöÇ Cross-Department Preview Scope Notice Banner ΓöÇΓöÇ */}
      {department !== 'CSE' && (
        <div className="rounded-[22px] border border-[#F4DA69]/70 bg-[#FDF8E2] p-4 text-xs text-[#6B530E] flex items-start gap-3 shadow-xs">
          <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-[#4A3805]">
              Cross-Department Preview Active: Viewing {DEPARTMENTS.find((d) => d.id === department)?.name} ({department})
            </p>
            <p className="text-[#6B530E] font-medium">
              Coordinator identity is pinned to <strong>Dr. Ananya Mishra</strong> (Assigned Department: <strong>Computer Science &amp; Engineering ΓÇö CSE</strong>).
              In production, Department Coordinators manage only their assigned home department. Cross-department switching is enabled in Dev Preview mode for curriculum inspection.
            </p>
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ Coordinator Role Navigation Pill Tabs ΓöÇΓöÇ */}
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
      {/* ΓöÇΓöÇ TAB 1: Department Overview ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'coordinator-overview' && (
        <div className="space-y-6">
          {datasetError && (
            <ErrorAlert
              message={`Failed to load department dataset: ${datasetError}`}
              onRetry={refetchDataset}
            />
          )}

          {/* Department Statistics Grid (Intelly Pastel Stat Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Department Faculty"
              value={datasetLoading ? 'ΓÇª' : datasetError ? 'N/A' : deptFaculty.length}
              icon={Users}
              trend={
                deptFaculty.length > 0
                  ? `${deptFaculty.length} assigned professors`
                  : 'No faculty assigned'
              }
              color="yellow"
            />
            <StatCard
              title="Active Courses"
              value={
                datasetLoading
                  ? 'ΓÇª'
                  : datasetError
                  ? 'N/A'
                  : deptCourses.length > 0
                  ? deptCourses.length
                  : 'N/A'
              }
              icon={BookOpen}
              trend={
                deptCourses.length > 0
                  ? `${deptCourses.length} curriculum offerings`
                  : 'No courses registered'
              }
              color="blue"
            />
            <StatCard
              title="Weekly Sessions"
              value={
                timetableLoading
                  ? 'ΓÇª'
                  : timetableError
                  ? 'N/A'
                  : deptSessions.length > 0
                  ? deptSessions.length
                  : 'N/A'
              }
              icon={Calendar}
              trend={
                timetableLoading
                  ? 'Evaluating scheduleΓÇª'
                  : timetableError
                  ? 'Solver timeout'
                  : `${deptSessions.length} sessions scheduled`
              }
              color="lavender"
            />
            <StatCard
              title="Dedicated Labs & Venues"
              value={
                datasetLoading
                  ? 'ΓÇª'
                  : datasetError
                  ? 'N/A'
                  : deptLabs.length > 0
                  ? deptLabs.length
                  : 'N/A'
              }
              icon={DoorOpen}
              trend={
                deptLabs.length > 0
                  ? `${deptLabs.length} specialized venues`
                  : 'No dedicated labs'
              }
              color="green"
            />
          </div>

          {/* Department Entities / Information Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Faculty List Panel */}
            <div className="rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D5]">
                <h3 className="font-extrabold text-[#1E1E1E] text-sm flex items-center gap-2">
                  <Users size={16} className="text-[#6B530E]" />
                  <span>Department Faculty</span>
                </h3>
                <span className="text-xs font-bold text-[#75716B] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full">
                  {datasetLoading ? 'LoadingΓÇª' : `${deptFaculty.length} members`}
                </span>
              </div>

              {datasetLoading ? (
                <div className="py-8">
                  <LoadingSpinner message="Loading department faculty recordsΓÇª" />
                </div>
              ) : deptFaculty.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {deptFaculty.map((f) => {
                    const initials = getFacultyInitials(f.name);
                    return (
                      <div
                        key={f.id}
                        className="p-3 rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED]/50 flex items-center justify-between text-xs hover:bg-[#FAF6ED] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#151515] text-[#E9A8CE] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-extrabold text-[#1E1E1E] truncate">{f.name}</p>
                            <p className="text-[11px] text-[#75716B] font-medium">
                              ID: {f.id} ΓÇó Max: {f.max_hours_per_day}h/day
                            </p>
                          </div>
                        </div>
                        <span className="rounded-full bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2] px-2 py-0.5 font-bold text-[10px] shrink-0">
                          Active
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#A39E95] font-medium">
                  No faculty records found for {department}.
                </div>
              )}
            </div>

            {/* Department Labs & Facilities Panel */}
            <div className="rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D5]">
                <h3 className="font-extrabold text-[#1E1E1E] text-sm flex items-center gap-2">
                  <DoorOpen size={16} className="text-[#1E4378]" />
                  <span>Labs &amp; Facilities</span>
                </h3>
                <span className="text-xs font-bold text-[#75716B] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full">
                  {datasetLoading ? 'LoadingΓÇª' : `${deptLabs.length} venues`}
                </span>
              </div>

              {datasetLoading ? (
                <div className="py-8">
                  <LoadingSpinner message="Loading facilitiesΓÇª" />
                </div>
              ) : deptLabs.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {deptLabs.map((lab) => (
                    <div
                      key={lab.id}
                      className="p-3 rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED]/50 flex items-center justify-between text-xs hover:bg-[#FAF6ED] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-extrabold text-[#1E1E1E] truncate">{lab.name}</p>
                        <p className="text-[11px] text-[#75716B] font-medium">
                          {lab.id} ΓÇó {lab.building} ({lab.capacity} seats)
                        </p>
                      </div>
                      <span className="rounded-full bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB] px-2 py-0.5 font-bold text-[10px] uppercase shrink-0">
                        {lab.type}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#A39E95] font-medium">
                  No specialized laboratories mapped for {department}.
                </div>
              )}
            </div>

            {/* Student Batches & Cohorts Panel */}
            <div className="rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D5]">
                <h3 className="font-extrabold text-[#1E1E1E] text-sm flex items-center gap-2">
                  <BookOpen size={16} className="text-[#3C367C]" />
                  <span>Student Cohorts</span>
                </h3>
                <span className="text-xs font-bold text-[#75716B] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full">
                  {datasetLoading ? 'LoadingΓÇª' : `${deptGroups.length} batches`}
                </span>
              </div>

              {datasetLoading ? (
                <div className="py-8">
                  <LoadingSpinner message="Loading student cohortsΓÇª" />
                </div>
              ) : deptGroups.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {deptGroups.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED]/50 flex items-center justify-between text-xs hover:bg-[#FAF6ED] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-extrabold text-[#1E1E1E] truncate">{g.name}</p>
                        <p className="text-[11px] text-[#75716B] font-medium">
                          ID: {g.id} ΓÇó Size: {g.size} students
                        </p>
                      </div>
                      <span className="rounded-full bg-[#EFEFFD] text-[#3C367C] border border-[#B9B5F4] px-2 py-0.5 font-bold text-[10px] shrink-0">
                        Year {g.year}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#A39E95] font-medium">
                  No dedicated student cohorts registered for {department}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 2: Department Timetable ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'coordinator-timetable' && (
        <div className="space-y-4">
          {/* Timetable Filter Bar (Intelly Style) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FFFDF8] p-4 rounded-[24px] border border-[#E8E1D5] shadow-xs">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#75716B]" />
              <span className="text-xs font-bold text-[#1E1E1E]">
                Cohort &amp; Semester Filter:
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <select
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value)}
                  className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 pr-9 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:outline-none cursor-pointer hover:bg-white transition-colors"
                >
                  <option value="All">All Semesters ({deptSessions.length} sessions)</option>
                  <option value="3rd">3rd Semester (Year 2)</option>
                  <option value="5th">5th Semester (Year 3)</option>
                  <option value="1st">1st Semester (Year 1 Common)</option>
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#75716B] pointer-events-none" />
              </div>

              <button
                onClick={() => refetchTimetable()}
                disabled={timetableLoading}
                className="inline-flex items-center gap-2 rounded-full border border-[#E8E1D5] bg-[#FFFDF8] px-4 py-2 text-xs font-bold text-[#1E1E1E] shadow-2xs hover:bg-[#FAF6ED] transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${timetableLoading ? 'animate-spin text-[#E9A8CE]' : 'text-[#75716B]'}`} />
                <span>{timetableLoading ? 'SolvingΓÇª' : 'Refresh Timetable'}</span>
              </button>
            </div>
          </div>

          {timetableLoading ? (
            <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-16 shadow-xs text-center">
              <LoadingSpinner message="Generating department timetable with CP-SAT solverΓÇª Evaluating curriculum constraints." />
            </div>
          ) : timetableError ? (
            <ErrorAlert
              message={`Failed to load department timetable: ${timetableError}`}
              onRetry={refetchTimetable}
            />
          ) : (
            <div className="rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAF6ED] border-b border-[#E8E1D5] text-[#75716B] uppercase tracking-wider font-extrabold text-[11px]">
                    <tr>
                      <th className="px-4 py-3.5">Course</th>
                      <th className="px-4 py-3.5">Subject Title</th>
                      <th className="px-4 py-3.5">Day &amp; Period</th>
                      <th className="px-4 py-3.5">Venue</th>
                      <th className="px-4 py-3.5">Faculty</th>
                      <th className="px-4 py-3.5">Cohort</th>
                      <th className="px-4 py-3.5">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE8DA]">
                    {filteredTimetableSessions.map((session: ScheduledSession) => {
                      const course =
                        deptCourses.find((c) => c.id === session.course_id) ??
                        fullDataset?.courses?.find((c) => c.id === session.course_id);
                      const faculty = fullDataset?.faculty?.find((f) => f.id === session.faculty_id);
                      const room = fullDataset?.rooms?.find((r) => r.id === session.room_id);
                      const periodTime = PERIOD_TIME_STRINGS[session.period] ?? `Period ${session.period}`;
                      const facultyInitials = faculty ? getFacultyInitials(faculty.name) : 'FM';

                      return (
                        <tr key={session.session_id} className="hover:bg-[#FAF6ED]/40 transition-colors">
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-xs font-black text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                              {session.course_id}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-[#1E1E1E]">
                            {course?.title ?? session.course_id}
                          </td>
                          <td className="px-4 py-3.5 text-[#1E1E1E]">
                            <span className="font-extrabold">{session.day}</span>
                            {' '}ΓÇó <span className="font-medium text-[#75716B]">P{session.period} ({periodTime})</span>
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-[#1E1E1E]">
                            <span className="flex items-center gap-1">
                              <MapPin size={12} className="text-[#A39E95] shrink-0" />
                              {room?.name ? `${room.name} (${session.room_id})` : session.room_id}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[#1E1E1E]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-5 h-5 rounded-full bg-[#151515] text-[#E9A8CE] flex items-center justify-center font-bold text-[9px] shrink-0">
                                {facultyInitials}
                              </div>
                              <span className="truncate font-semibold" title={faculty?.name ?? session.faculty_id}>
                                {faculty?.name ? faculty.name : session.faculty_id}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="rounded-md bg-white border border-[#E8E1D5] px-2 py-0.5 font-bold text-[10px] text-[#1E1E1E]">
                              {session.groups.join(', ')}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                session.kind === 'lab'
                                  ? 'bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB]'
                                  : session.kind === 'tutorial'
                                  ? 'bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2]'
                                  : 'bg-[#FDF6D8] text-[#71540A] border border-[#F4DA69]'
                              }`}
                            >
                              {session.kind}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredTimetableSessions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-[#A39E95]">
                          No scheduled sessions found for {department} ({selectedSemester === 'All' ? 'All Semesters' : `${selectedSemester} Semester`}).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 3: Request Session Changes ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'coordinator-sessions' && (
        <div className="space-y-6">
          {/* Notice Banner */}
          <div className="flex items-start gap-3 p-4 rounded-[22px] bg-[#FDF8E2] border border-[#F4DA69]/70 text-xs text-[#6B530E] shadow-xs">
            <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                Notice: Session Rescheduling Request API Pending Backend Implementation
              </p>
              <p className="text-[#6B530E] font-medium leading-relaxed">
                This form serves as an interactive coordinator interface. Proposed session changes will be validated against the CP-SAT rescheduling engine (<code>POST /api/reschedule/propose</code>) and queued for Administrator approval once the request persistence endpoint is deployed. Submissions in this preview are simulated.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Form Card */}
            <div className="lg:col-span-5 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="border-b border-[#E8E1D5] pb-3">
                <h3 className="text-base font-extrabold text-[#1E1E1E]">
                  Propose Session Reschedule or Room Move
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Request a new time slot or venue for an existing departmental class.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Course Selector */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Course Offering</label>
                  <select
                    value={changeCourse}
                    onChange={(e) => setChangeCourse(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    {deptCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} ΓÇö {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current Session to Move */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Current Session to Move</label>
                  <select
                    value={changeSessionId}
                    onChange={(e) => setChangeSessionId(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    <option value="">Select Existing Scheduled Session</option>
                    {deptSessions.map((s) => (
                      <option key={s.session_id} value={s.session_id}>
                        {s.course_id} on {s.day} P{s.period} ({s.groups.join(', ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Target Day */}
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Requested Day</label>
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

                  {/* Target Period */}
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Requested Period</label>
                    <select
                      value={changeTargetPeriod}
                      onChange={(e) => setChangeTargetPeriod(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      <option value="1">Period 1 (08:00 ΓÇô 09:00)</option>
                      <option value="2">Period 2 (09:00 ΓÇô 10:00)</option>
                      <option value="3">Period 3 (10:00 ΓÇô 11:00)</option>
                      <option value="4">Period 4 (11:00 ΓÇô 12:00)</option>
                      <option value="5">Period 5 (12:00 ΓÇô 13:00)</option>
                      <option value="6">Period 6 (14:00 ΓÇô 15:00)</option>
                      <option value="7">Period 7 (15:00 ΓÇô 16:00)</option>
                      <option value="8">Period 8 (16:00 ΓÇô 17:00)</option>
                    </select>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Reason for Reschedule</label>
                  <input
                    type="text"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="e.g. Faculty medical duty, lab repair, syllabus catch-up..."
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8E1D5] space-y-2">
                <button
                  type="button"
                  disabled
                  title="Rescheduling submission endpoint is pending backend implementation. Read-only preview."
                  className="w-full rounded-full bg-[#151515] px-4 py-2.5 text-xs font-bold text-white shadow-2xs opacity-60 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft size={13} />
                  <span>Submit Change Request (Pending Backend API)</span>
                </button>
                <p className="text-[11px] text-[#A39E95] text-center font-medium">
                  Preview interface only. Submissions will be wired to CP-SAT solver upon API deployment.
                </p>
              </div>
            </div>

            {/* Right Column: Review Pending & Previous Session Proposals */}
            <div className="lg:col-span-7 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#1E1E1E]">
                    Department Session Proposals Log
                  </h3>
                  <p className="text-xs text-[#75716B] font-medium mt-0.5">
                    Review pending, approved, rejected, and alternative decisions.
                  </p>
                </div>
                <span className="text-xs font-bold bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-1 rounded-full text-[#1E1E1E]">
                  {INITIAL_PROPOSALS.length} proposals
                </span>
              </div>

              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {INITIAL_PROPOSALS.map((prop) => (
                  <div
                    key={prop.id}
                    className="p-4 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 space-y-2 hover:bg-[#FAF6ED] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black text-[#1E1E1E] bg-white border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                            {prop.courseId}
                          </span>
                          <span className="font-extrabold text-xs text-[#1E1E1E]">
                            {prop.courseTitle}
                          </span>
                          <span className="text-[10px] text-[#A39E95] font-semibold">
                            ΓÇó {prop.submittedAt}
                          </span>
                        </div>
                        <p className="text-xs text-[#75716B] font-medium">
                          Instructor: <strong>{prop.facultyName}</strong> ΓÇó Venue: {prop.venue}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                          prop.status === 'approved'
                            ? 'bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2]'
                            : prop.status === 'alternative_offered'
                            ? 'bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB]'
                            : prop.status === 'rejected'
                            ? 'bg-[#FCF2F7] text-[#7A1F52] border border-[#E9A8CE]'
                            : 'bg-[#FDF8E2] text-[#6B530E] border border-[#F4DA69]'
                        }`}
                      >
                        {prop.status === 'approved' && <CheckCircle2 size={11} />}
                        {prop.status === 'rejected' && <XCircle size={11} />}
                        {prop.status === 'pending' && <Clock size={11} />}
                        {prop.status === 'alternative_offered' && <ArrowRightLeft size={11} />}
                        {prop.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Reschedule Diff Box */}
                    <div className="flex items-center gap-2 text-xs bg-white/80 border border-[#E8E1D5] rounded-xl px-3 py-2 text-[#1E1E1E]">
                      <span className="text-[#A39E95] font-bold">FROM:</span>
                      <span className="font-semibold line-through text-[#75716B]">{prop.currentSlot}</span>
                      <ArrowRightLeft size={12} className="text-[#E9A8CE] shrink-0 mx-1" />
                      <span className="text-[#A39E95] font-bold">TO:</span>
                      <span className="font-extrabold text-[#1E1E1E]">{prop.proposedSlot}</span>
                    </div>

                    {/* Reason & Decision Note */}
                    <p className="text-xs text-[#75716B] font-medium">
                      <strong className="text-[#1E1E1E]">Reason:</strong> {prop.reason}
                    </p>
                    {prop.decisionNote && (
                      <div className="p-2 rounded-xl bg-white border border-[#E8E1D5] text-[11px] text-[#1E1E1E] font-medium flex items-start gap-1.5">
                        <Info size={13} className="text-[#A39E95] shrink-0 mt-0.5" />
                        <span><strong>Decision Note:</strong> {prop.decisionNote}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 4: Department Bookings ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'coordinator-bookings' && (
        <div className="space-y-6">
          {/* Notice Banner */}
          <div className="flex items-start gap-3 p-4 rounded-[22px] bg-[#FDF8E2] border border-[#F4DA69]/70 text-xs text-[#6B530E] shadow-xs">
            <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                Notice: Department Event Booking API Pending Backend Implementation
              </p>
              <p className="text-[#6B530E] font-medium leading-relaxed">
                Department coordinators can test venue selection and attendee capacity rules here. Requests will be saved to the live booking ledger once the write API endpoint is deployed. Submissions are not currently persisted.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Booking Form Card */}
            <div className="lg:col-span-5 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="border-b border-[#E8E1D5] pb-3">
                <h3 className="text-base font-extrabold text-[#1E1E1E]">
                  Reserve Venue for Department Event
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Request auditoriums, seminar halls, or departmental labs for academic events.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Event Title */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Event Title</label>
                  <input
                    type="text"
                    placeholder="e.g. CSE Alumni Talk on Cloud Native Architecture"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  />
                </div>

                {/* Event Category */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Category</label>
                  <select
                    value={eventCategory}
                    onChange={(e) =>
                      setEventCategory(
                        e.target.value as 'guest_lecture' | 'department_event' | 'workshop' | 'seminar'
                      )
                    }
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    <option value="department_event">Department Event</option>
                    <option value="guest_lecture">Guest Lecture</option>
                    <option value="workshop">Technical Workshop</option>
                    <option value="seminar">Research Seminar</option>
                  </select>
                </div>

                {/* Preferred Venue */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Preferred Venue</label>
                  <select
                    value={eventVenue}
                    onChange={(e) => setEventVenue(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    {fullDataset?.rooms?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id}) ΓÇö {r.capacity} seats
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Expected Attendance */}
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Expected Attendance</label>
                    <input
                      type="number"
                      min="10"
                      max="500"
                      value={eventAttendance}
                      onChange={(e) => setEventAttendance(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    />
                  </div>

                  {/* Target Day */}
                  <div className="space-y-1">
                    <label className="font-bold text-[#1E1E1E]">Target Day</label>
                    <select
                      value={eventDay}
                      onChange={(e) => setEventDay(e.target.value)}
                      className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                    >
                      <option value="MON">Monday</option>
                      <option value="TUE">Tuesday</option>
                      <option value="WED">Wednesday</option>
                      <option value="THU">Thursday</option>
                      <option value="FRI">Friday</option>
                      <option value="SAT">Saturday</option>
                    </select>
                  </div>
                </div>

                {/* Target Period Window */}
                <div className="space-y-1">
                  <label className="font-bold text-[#1E1E1E]">Period Slot (1 hour duration)</label>
                  <select
                    value={eventPeriod}
                    onChange={(e) => setEventPeriod(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                  >
                    <option value="6">Period 6 (14:00 ΓÇô 15:00)</option>
                    <option value="7">Period 7 (15:00 ΓÇô 16:00)</option>
                    <option value="8">Period 8 (16:00 ΓÇô 17:00)</option>
                    <option value="9">Period 9 (17:00 ΓÇô 18:00)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E8E1D5] space-y-2">
                <button
                  type="button"
                  disabled
                  title="Event booking submission endpoint is pending backend implementation. Read-only preview."
                  className="w-full rounded-full bg-[#151515] px-4 py-2.5 text-xs font-bold text-white shadow-2xs opacity-60 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CalendarPlus size={13} />
                  <span>Book Venue (Pending Backend API)</span>
                </button>
                <p className="text-[11px] text-[#A39E95] text-center font-medium">
                  Preview interface only. Data entered will be wired to backend persistence endpoints upon API deployment.
                </p>
              </div>
            </div>

            {/* Right: Existing Department Bookings Table */}
            <div className="lg:col-span-7 rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#1E1E1E]">
                    Department Events &amp; Reservations
                  </h3>
                  <p className="text-xs text-[#75716B] font-medium mt-0.5">
                    Live department reservations from the campus booking ledger.
                  </p>
                </div>
                <span className="text-xs font-bold bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-1 rounded-full text-[#1E1E1E]">
                  {deptEventBookings.length} events
                </span>
              </div>

              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {deptEventBookings.length > 0 ? (
                  deptEventBookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 space-y-2 hover:bg-[#FAF6ED] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-[#1E1E1E] bg-white border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                              {b.id}
                            </span>
                            <span className="font-extrabold text-xs text-[#1E1E1E]">
                              {b.title}
                            </span>
                          </div>
                          <p className="text-xs text-[#75716B] font-medium mt-0.5">
                            Requester: {b.requester} ΓÇó Category: {b.requested_category}
                          </p>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                            b.status === 'approved'
                              ? 'bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2]'
                              : b.status === 'alternative_offered'
                              ? 'bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB]'
                              : 'bg-[#FCF2F7] text-[#7A1F52] border border-[#E9A8CE]'
                          }`}
                        >
                          {b.status === 'approved' && <CheckCircle2 size={11} />}
                          {b.status === 'rejected' && <XCircle size={11} />}
                          {b.status === 'alternative_offered' && <ArrowRightLeft size={11} />}
                          {b.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-[#75716B] font-medium flex-wrap pt-0.5">
                        <span className="flex items-center gap-1 text-[#1E1E1E] font-semibold">
                          <MapPin size={12} className="text-[#A39E95]" />
                          {b.allocated?.room_id ?? b.requested_room ?? 'TBD'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-[#A39E95]" />
                          {b.attendance} attendees
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-[#A39E95]" />
                          {b.day ?? 'TBD'} ΓÇó {b.timeSlot ?? (b.allocated ? `Period ${b.allocated.start_period}` : 'TBD')}
                        </span>
                      </div>

                      {b.reasons && b.reasons.length > 0 && (
                        <p className="text-[11px] text-[#75716B] italic pt-1 border-t border-[#E8E1D5]">
                          Solver Reason: {b.reasons.join(', ')}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-xs text-[#A39E95] font-medium">
                    No active bookings found for {department} departmental events.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 5: Department Lab Booking Approvals ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'coordinator-approvals' && (
        <div className="space-y-4">
          {/* Notice Banner */}
          <div className="flex items-start gap-3 p-4 rounded-[22px] bg-[#FDF8E2] border border-[#F4DA69]/70 text-xs text-[#6B530E] shadow-xs">
            <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                Notice: Coordinator Approval Workflow API Pending Backend Implementation
              </p>
              <p className="text-[#6B530E] font-medium leading-relaxed">
                Live booking requests and solver conflict decisions for departmental laboratories ({department} facilities) are displayed below. Approve and Reject actions are available exclusively for genuinely pending requests in Dev Preview simulation mode. Final decisions (Approved, Rejected, Alternative Offered) display their immutable solver status.
              </p>
            </div>
          </div>

          {bookingsLoading ? (
            <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-16 shadow-xs text-center">
              <LoadingSpinner message="Loading departmental laboratory booking requests..." />
            </div>
          ) : bookingsError ? (
            <ErrorAlert message={bookingsError} onRetry={refetchBookings} />
          ) : (
            <div className="rounded-[26px] border border-[#E8E1D5] bg-[#FFFDF8] shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E8E1D5] flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-[#1E1E1E] text-sm">
                    Lab Booking Approvals ({deptLabApprovals.length})
                  </h3>
                  <p className="text-xs text-[#75716B] font-medium mt-0.5">
                    Live requests targeting {department} laboratories ({deptLabs.map((l) => l.name).join(', ')}).
                  </p>
                </div>
                <button
                  onClick={() => refetchBookings()}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-3 py-1.5 rounded-full hover:bg-white transition-colors cursor-pointer"
                >
                  <RefreshCw size={12} className="text-[#75716B]" />
                  <span>Refresh Decisions</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAF6ED] border-b border-[#E8E1D5] text-[#75716B] uppercase tracking-wider font-extrabold text-[11px]">
                    <tr>
                      <th className="px-4 py-3.5">Req ID</th>
                      <th className="px-4 py-3.5">Event Title</th>
                      <th className="px-4 py-3.5">Requester</th>
                      <th className="px-4 py-3.5">Target Venue</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Decision Reasons</th>
                      <th className="px-4 py-3.5 text-right">Coordinator Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE8DA]">
                    {deptLabApprovals.map((booking: ProcessedBooking) => (
                      <tr key={booking.id} className="hover:bg-[#FAF6ED]/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs font-bold text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-2 py-0.5 rounded-lg">
                            {booking.id}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-[#1E1E1E]">
                          {booking.title}
                        </td>
                        <td className="px-4 py-3.5 text-[#75716B] font-semibold">
                          {booking.requester}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-[#1E1E1E]">
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-[#A39E95] shrink-0" />
                            {booking.allocated?.room_id ?? booking.requested_room ?? 'TBD'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              booking.status === 'approved'
                                ? 'bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2]'
                                : booking.status === 'alternative_offered'
                                ? 'bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB]'
                                : booking.status === 'rejected'
                                ? 'bg-[#FCF2F7] text-[#7A1F52] border border-[#E9A8CE]'
                                : 'bg-[#FDF8E2] text-[#6B530E] border border-[#F4DA69]'
                            }`}
                          >
                            {booking.status === 'approved' && <CheckCircle2 size={11} />}
                            {booking.status === 'rejected' && <XCircle size={11} />}
                            {booking.status === 'alternative_offered' && <ArrowRightLeft size={11} />}
                            {booking.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[#75716B] max-w-xs font-medium space-y-1">
                          <span className="line-clamp-2" title={booking.reasons?.join(', ')}>
                            {booking.reasons?.join(', ') || 'Optimal room fit: constraints satisfied.'}
                          </span>
                          {booking.status === 'alternative_offered' && (booking.alternative || booking.allocated) && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#E8F0FC] text-[#1E4378] border border-[#B8CDEB] px-1.5 py-0.5 text-[10px] font-bold">
                              Alternative Offered: {(booking.alternative ?? booking.allocated)?.room_id} ({(booking.alternative ?? booking.allocated)?.day} P{(booking.alternative ?? booking.allocated)?.start_period})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {booking.status === 'pending' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDecisionDialog(booking, 'approve')}
                                className="rounded-full bg-[#EAF5ED] border border-[#B9D9C2] px-2.5 py-1 text-[11px] font-bold text-[#1E5C32] hover:bg-[#B9D9C2]/40 transition-colors cursor-pointer"
                                title="Simulate laboratory approval (Dev Preview)"
                              >
                                Approve (Dev Preview)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDecisionDialog(booking, 'reject')}
                                className="rounded-full bg-[#FCF2F7] border border-[#E9A8CE] px-2.5 py-1 text-[11px] font-bold text-[#7A1F52] hover:bg-[#E9A8CE]/40 transition-colors cursor-pointer"
                                title="Simulate laboratory rejection (Dev Preview)"
                              >
                                Reject (Dev Preview)
                              </button>
                            </div>
                          ) : booking.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#1E5C32] bg-[#EAF5ED] border border-[#B9D9C2] px-2.5 py-0.5 rounded-full">
                              <CheckCircle2 size={12} />
                              Final: Approved
                            </span>
                          ) : booking.status === 'rejected' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#7A1F52] bg-[#FCF2F7] border border-[#E9A8CE] px-2.5 py-0.5 rounded-full">
                              <XCircle size={12} />
                              Final: Rejected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#1E4378] bg-[#E8F0FC] border border-[#B8CDEB] px-2.5 py-0.5 rounded-full">
                              <ArrowRightLeft size={12} />
                              Final: Alt Offered
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {deptLabApprovals.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-[#A39E95] font-medium">
                          No pending lab requests for {department} facilities.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ΓöÇΓöÇ Consequential Decision Confirmation Dialog ΓöÇΓöÇ */}
      {selectedBookingForDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[28px] bg-[#FFFDF8] p-6 shadow-2xl border border-[#E8E1D5] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Dialog Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D5] pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-[#FAF6ED] border border-[#E8E1D5] text-[#1E1E1E]">
                    {selectedBookingForDecision.id}
                  </span>
                  <span
                    className={`text-xs uppercase font-extrabold px-2.5 py-0.5 rounded-full ${
                      decisionActionType === 'approve'
                        ? 'bg-[#EAF5ED] text-[#1E5C32] border border-[#B9D9C2]'
                        : 'bg-[#FCF2F7] text-[#7A1F52] border border-[#E9A8CE]'
                    }`}
                  >
                    Confirm {decisionActionType === 'approve' ? 'Laboratory Approval' : 'Request Rejection'}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-[#1E1E1E] mt-1.5 leading-snug">
                  {selectedBookingForDecision.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBookingForDecision(null)}
                className="rounded-full p-1.5 text-[#75716B] hover:text-[#1E1E1E] hover:bg-[#FAF6ED] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Request Summary */}
            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-[#FAF6ED]/70 border border-[#E8E1D5] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#75716B] font-semibold">Requester:</span>
                  <strong className="text-[#1E1E1E] font-bold">{selectedBookingForDecision.requester}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#75716B] font-semibold">Target Facility:</span>
                  <strong className="text-[#1E1E1E] font-bold">
                    {selectedBookingForDecision.allocated?.room_id ?? selectedBookingForDecision.requested_room ?? 'TBD'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#75716B] font-semibold">Attendance:</span>
                  <span className="font-bold text-[#1E1E1E]">{selectedBookingForDecision.attendance} expected attendees</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#75716B] font-semibold">Scheduled Window:</span>
                  <span className="font-bold text-[#1E1E1E]">
                    {selectedBookingForDecision.day ?? 'TBD'} ΓÇó {selectedBookingForDecision.timeSlot ?? (selectedBookingForDecision.allocated ? `Period ${selectedBookingForDecision.allocated.start_period}` : 'TBD')}
                  </span>
                </div>
              </div>

              {/* Solver Reasons */}
              <div className="p-3 rounded-2xl bg-white border border-[#E8E1D5] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#75716B] block">
                  CP-SAT Solver Conflict Analysis
                </span>
                <p className="text-xs text-[#1E1E1E] font-medium leading-relaxed">
                  {selectedBookingForDecision.reasons?.join(', ') || 'All curriculum constraints and venue capacity limits satisfied.'}
                </p>
              </div>

              {/* Coordinator Decision Note Input */}
              <div className="space-y-1">
                <label className="font-bold text-[#1E1E1E] text-xs">
                  Coordinator Decision Note (Recorded with approval):
                </label>
                <textarea
                  rows={2}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  className="w-full rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] p-2.5 text-xs text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE]"
                />
              </div>

              {/* Dev Preview Notice */}
              <div className="rounded-xl border border-[#F4DA69]/70 bg-[#FDF8E2] p-2.5 text-[11px] text-[#6B530E] flex items-start gap-2">
                <Info size={13} className="text-[#6B530E] shrink-0 mt-0.5" />
                <span>
                  <strong>Dev Preview / Simulation:</strong> Persistent coordinator decision recording is unavailable because the backend endpoint (<code>POST /api/bookings/{selectedBookingForDecision.id}/decision</code>) is pending deployment. This is a simulation preview; the booking status is not modified.
                </span>
              </div>
            </div>

            {/* Dialog Footer Actions */}
            <div className="pt-3 border-t border-[#E8E1D5] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseDecisionDialog}
                className="rounded-full border border-[#E8E1D5] bg-[#FFFDF8] px-4 py-2 text-xs font-bold text-[#1E1E1E] hover:bg-[#FAF6ED] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseDecisionDialog}
                className={`rounded-full px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
                  decisionActionType === 'approve'
                    ? 'bg-[#1B4D2E] hover:bg-[#153D23]'
                    : 'bg-[#7A1F52] hover:bg-[#5E183F]'
                }`}
              >
                Close Simulation (Dev Preview)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}