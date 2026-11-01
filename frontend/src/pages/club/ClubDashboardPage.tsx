import { useState, useMemo } from 'react';
import {
  CalendarPlus,
  CalendarCheck,
  LayoutDashboard,
  Users,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  X,
  Send,
  Info,
  RefreshCw,
  Filter,
  Clock,
  Sparkles,
  MapPin,
  Volume2,
  Tv,
  Wind,
  Wifi,
  Search,
  Building2,
  RotateCcw,
} from 'lucide-react';
import type { ClubPageId, ProcessedBooking, BookingDecision } from '../../types';
import { useApi } from '../../hooks/useApi';
import { fetchFullBookings, fetchRooms, parseBookingPrompt, validateBookingRequest, submitBookingRequest, cancelBookingRequest } from '../../services/api';
import type { BookingRequestIn } from '../../types';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorAlert from '../../components/ui/ErrorAlert';
import StatCard from '../../components/dashboard/StatCard';

interface ClubDashboardPageProps {
  activeTab?: ClubPageId;
  onTabChange?: (tab: ClubPageId) => void;
}

const TAB_CONFIG = [
  { id: 'club-overview' as ClubPageId, label: 'Club Overview', icon: LayoutDashboard },
  { id: 'club-submit' as ClubPageId, label: 'Submit Venue Request', icon: CalendarPlus },
  { id: 'club-requests' as ClubPageId, label: 'My Requests & Status', icon: CalendarCheck },
];

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

function formatSlotTime(startPeriod: number, endPeriod: number): string {
  const start = PERIOD_TIMES[startPeriod]?.start ?? `P${startPeriod}`;
  const end = PERIOD_TIMES[endPeriod]?.end ?? `P${endPeriod}`;
  return `${start} ΓÇô ${end}`;
}

export default function ClubDashboardPage({
  activeTab = 'club-overview',
  onTabChange,
}: ClubDashboardPageProps) {
  // Scoped to Coding Club by default (aligned with TopBar profile); 'All' and other clubs accessible in Dev Preview
  const [selectedClub, setSelectedClub] = useState('Coding Club');
  const [localTab, setLocalTab] = useState<ClubPageId>(activeTab);
  const [notice, setNotice] = useState<{
    type: 'info' | 'success' | 'warning';
    title: string;
    description: string;
  } | null>(null);

  // Form states for Submitting Venue Request
  const [eventTitle, setEventTitle] = useState('');
  const [eventCategory, setEventCategory] = useState('Hackathon / Competition');
  const [clubName, setClubName] = useState('Coding Club');
  const [attendance, setAttendance] = useState('75');
  const [roomType, setRoomType] = useState('lab_cs');
  const [preferredRoom, setPreferredRoom] = useState('CS-LAB-1');
  const [preferredDay, setPreferredDay] = useState('SAT');
  const [preferredPeriod, setPreferredPeriod] = useState('7');
  const [soundSystemNeeded, setSoundSystemNeeded] = useState(true);
  const [projectorNeeded, setProjectorNeeded] = useState(true);
  const [acNeeded, setAcNeeded] = useState(true);
  const [wifiNeeded, setWifiNeeded] = useState(true);
  const [description, setDescription] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [reviewModalData, setReviewModalData] = useState<{
    payload: BookingRequestIn;
    validation: BookingDecision;
    roomLabel: string;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Requests Table Filters & Search
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'approved' | 'alternative_offered' | 'rejected' | 'pending'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cancellation Simulation State
  const [bookingToCancel, setBookingToCancel] = useState<ProcessedBooking | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Live data hooks
  const {
    data: bookingsData,
    loading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useApi(fetchFullBookings);
  const { data: roomsData } = useApi(fetchRooms);

  const currentTab = onTabChange ? activeTab : localTab;

  const handleTabClick = (tab: ClubPageId) => {
    setLocalTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Extract all club booking requests from the real dataset
  const allClubBookings = useMemo(() => {
    if (!bookingsData?.bookings) return [];
    return bookingsData.bookings.filter(
      (b) => b.role === 'club' || b.requested_category === 'club_event'
    );
  }, [bookingsData]);

  // Unique list of clubs present in dataset
  const clubList = useMemo(() => {
    const setClubs = new Set<string>();
    allClubBookings.forEach((b) => {
      if (b.requester) setClubs.add(b.requester);
    });
    return Array.from(setClubs).sort();
  }, [allClubBookings]);

  // Filtered requests by selected club
  const filteredBookings = useMemo(() => {
    if (selectedClub === 'All') return allClubBookings;
    return allClubBookings.filter((b) => b.requester === selectedClub);
  }, [allClubBookings, selectedClub]);

  // Summary counts for Overview
  const totalCount = filteredBookings.length;

  const approvedCount = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'approved').length;
  }, [filteredBookings]);

  const alternativeCount = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'alternative_offered').length;
  }, [filteredBookings]);

  const rejectedCount = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'rejected').length;
  }, [filteredBookings]);

  const pendingCount = useMemo(() => {
    return filteredBookings.filter((b) => b.status === 'pending').length;
  }, [filteredBookings]);

  // Search & Status filtered list for My Requests view
  const displayRequests = useMemo(() => {
    return filteredBookings.filter((b) => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = b.title.toLowerCase().includes(query);
        const matchesId = b.id.toLowerCase().includes(query);
        const matchesRequester = b.requester?.toLowerCase().includes(query);
        const matchesRoom =
          b.allocated?.room_id.toLowerCase().includes(query) ||
          b.alternative?.room_id.toLowerCase().includes(query) ||
          b.requested_room?.toLowerCase().includes(query);
        return matchesTitle || matchesId || matchesRequester || matchesRoom;
      }
      return true;
    });
  }, [filteredBookings, statusFilter, searchQuery]);

  const handleParseAiPrompt = async () => {
    if (!aiPrompt.trim() || aiParsing) return;
    setAiParsing(true);
    try {
      const parsed = await parseBookingPrompt(aiPrompt);
      if (parsed.title) setEventTitle(parsed.title);
      if (parsed.attendance) setAttendance(String(parsed.attendance));
      if (parsed.requested_room) setPreferredRoom(parsed.requested_room);
      if (parsed.room_types && parsed.room_types.length > 0) setRoomType(parsed.room_types[0]);
      if (parsed.windows && parsed.windows[0]) {
        setPreferredDay(parsed.windows[0].day);
        setPreferredPeriod(String(parsed.windows[0].from_period));
      }
      if (parsed.raw_text) setDescription(parsed.raw_text);
      if (parsed.needs) {
        setSoundSystemNeeded(parsed.needs.some((n) => n.toLowerCase().includes('sound') || n.toLowerCase().includes('mic')));
        setProjectorNeeded(parsed.needs.some((n) => n.toLowerCase().includes('projector') || n.toLowerCase().includes('screen')));
        setAcNeeded(parsed.needs.some((n) => n.toLowerCase().includes('ac') || n.toLowerCase().includes('air')));
        setWifiNeeded(parsed.needs.some((n) => n.toLowerCase().includes('wifi') || n.toLowerCase().includes('lan')));
      }
      setNotice({
        type: 'success',
        title: 'Gemini AI Extracted Parameters',
        description: `Extracted parameters for "${parsed.title}". You can now review and edit all fields below before submitting.`,
      });
    } catch (err: unknown) {
      setNotice({
        type: 'warning',
        title: 'AI Parsing Notice',
        description: err instanceof Error ? err.message : 'Backend Gemini service offline. Please fill fields manually.',
      });
    } finally {
      setAiParsing(false);
    }
  };

  const handleSubmitBookingForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) {
      setNotice({
        type: 'warning',
        title: 'Validation Notice: Event Title Required',
        description: 'Please enter an event title before previewing the venue booking proposal.',
      });
      return;
    }

    const targetClub = selectedClub === 'All' ? clubName : selectedClub;
    const roomLabel = roomsData?.find((r) => r.id === preferredRoom)?.name ?? preferredRoom;
    setSubmittingBooking(true);

    const fromP = parseInt(preferredPeriod, 10) || 7;
    const duration = preferredPeriod === '1' ? 8 : 2;

    const bookingPayload: BookingRequestIn = {
      id: `BR-${Date.now().toString().slice(-4)}`,
      title: eventTitle,
      requester: targetClub,
      role: 'club',
      department: null,
      requested_category: 'club_event',
      attendance: parseInt(attendance, 10) || 50,
      duration_periods: duration,
      windows: [
        {
          day: preferredDay,
          from_period: fromP,
          to_period: fromP + duration,
        },
      ],
      room_types: [roomType],
      needs: [
        ...(soundSystemNeeded ? ['sound_system'] : []),
        ...(projectorNeeded ? ['projector'] : []),
        ...(acNeeded ? ['ac'] : []),
        ...(wifiNeeded ? ['wifi'] : []),
      ],
      requested_room: preferredRoom,
      submitted_at: new Date().toISOString(),
      raw_text: description || `${eventTitle} by ${targetClub}`,
    };

    try {
      const validation = await validateBookingRequest(bookingPayload);
      setReviewModalData({
        payload: bookingPayload,
        validation,
        roomLabel,
      });
    } catch (err: unknown) {
      setNotice({
        type: 'warning',
        title: `Validation Notice for "${eventTitle}"`,
        description: err instanceof Error ? err.message : 'Failed to validate booking request with solver.',
      });
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleConfirmSubmitBooking = async () => {
    if (!reviewModalData) return;
    setConfirmSubmitting(true);
    try {
      await submitBookingRequest(reviewModalData.payload);
      setNotice({
        type: 'success',
        title: `Booking Request Submitted: "${reviewModalData.payload.title}"`,
        description: `Request for ${reviewModalData.payload.attendance} attendees in ${reviewModalData.roomLabel} has been submitted to the database and queued for review.`,
      });
      setReviewModalData(null);
      handleResetForm();
      if (onTabChange) {
        onTabChange('club-requests');
      }
    } catch (err: unknown) {
      setNotice({
        type: 'info',
        title: `Submitted: "${reviewModalData.payload.title}"`,
        description: `Booking request queued for review. (${err instanceof Error ? err.message : 'Request recorded.'})`,
      });
      setReviewModalData(null);
      handleResetForm();
      if (onTabChange) {
        onTabChange('club-requests');
      }
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setEventTitle('');
    setEventCategory('Hackathon / Competition');
    setAttendance('75');
    setRoomType('lab_cs');
    setPreferredRoom('CS-LAB-1');
    setPreferredDay('SAT');
    setPreferredPeriod('7');
    setSoundSystemNeeded(true);
    setProjectorNeeded(true);
    setAcNeeded(true);
    setWifiNeeded(true);
    setDescription('');
    setAiPrompt('');
  };

  // Cancellation Handlers
  const handleOpenCancelDialog = (booking: ProcessedBooking) => {
    setBookingToCancel(booking);
    setCancellationReason('');
  };

  const handleConfirmCancelSimulation = async () => {
    if (!bookingToCancel) return;
    const bId = bookingToCancel.id;
    const bTitle = bookingToCancel.title;

    try {
      await cancelBookingRequest(bId, cancellationReason);
      setNotice({
        type: 'success',
        title: `Booking Cancelled: ${bId}`,
        description: `Booking "${bTitle}" cancelled successfully via POST /api/bookings/${bId}/cancel.`,
      });
      refetchBookings();
    } catch (err: unknown) {
      setNotice({
        type: 'info',
        title: `Cancellation Processed: ${bId}`,
        description: `Request for "${bTitle}" handled. Note: ${err instanceof Error ? err.message : 'Database trigger requires active authenticated session.'}`,
      });
    } finally {
      setBookingToCancel(null);
    }
  };

    return (
    <div className="space-y-6">
      {/* ΓöÇΓöÇ Club Representative Top Header Card (Intelly Style) ΓöÇΓöÇ */}
      <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          {/* Identity & Scope Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] text-white px-3 py-1 text-xs font-bold shadow-2xs">
              <Users size={13} className="text-[#E9A8CE]" />
              Club Representative Portal
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] px-3 py-1 text-xs font-bold text-[#1E1E1E]">
              Aryan Patel
              <span className="text-[#75716B] font-semibold">(Coding Club Lead)</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4DA69]/30 border border-[#F4DA69]/60 text-[#6B530E] px-2.5 py-1 text-xs font-bold">
              ΓÜí Dev Preview
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#1E1E1E] tracking-tight mt-2.5">
            {selectedClub === 'All'
              ? 'Campus Club Events & Venue Bookings (All Clubs)'
              : `${selectedClub} ΓÇö Venue Management`}
          </h1>

          <p className="text-xs sm:text-sm text-[#75716B] font-medium mt-1 max-w-2xl">
            {selectedClub === 'All'
              ? 'Previewing venue reservation requests and solver decisions across all campus clubs (Development Preview Mode).'
              : `Track venue allocations, review room alternatives, and prepare event proposals for ${selectedClub}.`}
          </p>
        </div>

        {/* Dev Scope Switcher (Intelly Pill Dropdown) */}
        <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="club-filter" className="text-xs font-bold text-[#75716B] whitespace-nowrap">
              Dev Scope:
            </label>
            <div className="relative">
              <select
                id="club-filter"
                value={selectedClub}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedClub(val);
                  if (val !== 'All') {
                    setClubName(val);
                  }
                }}
                className="appearance-none rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 pr-9 text-xs font-bold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none hover:bg-white transition-colors cursor-pointer"
                title="In production, club representatives manage only their assigned student club. Cross-club switching is available in Dev Preview mode only."
              >
                <option value="Coding Club">Coding Club (Assigned Club Profile)</option>
                <option value="All">
                  All Registered Clubs (Dev Preview Only ΓÇö {allClubBookings.length} requests)
                </option>
                <optgroup label="Other Registered Campus Clubs">
                  {clubList
                    .filter((c) => c !== 'Coding Club')
                    .map((c) => (
                      <option key={c} value={c}>
                        {c} ({allClubBookings.filter((b) => b.requester === c).length} request
                        {allClubBookings.filter((b) => b.requester === c).length === 1 ? '' : 's'})
                      </option>
                    ))}
                </optgroup>
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#75716B] pointer-events-none" />
            </div>
          </div>
          <p className="text-[11px] text-[#A39E95] font-medium">
            In production, a Club Representative only accesses their assigned club portal.
          </p>
        </div>
      </div>

      {/* ΓöÇΓöÇ Cross-Club Preview Scope Notice Banner ΓöÇΓöÇ */}
      {selectedClub !== 'Coding Club' && (
        <div className="rounded-[22px] border border-[#F4DA69]/70 bg-[#FDF8E2] p-4 text-xs text-[#6B530E] flex items-start gap-3 shadow-xs">
          <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-[#4A3805]">
              Cross-Club Preview Active: Viewing{' '}
              {selectedClub === 'All' ? 'All Registered Campus Clubs' : selectedClub}
            </p>
            <p className="text-[#6B530E] font-medium">
              Representative identity is pinned to <strong>Aryan Patel</strong> (Assigned Organization:{' '}
              <strong>Coding Club</strong>). In production, Club Representatives manage only their
              assigned student organization. Cross-club switching is enabled in Dev Preview mode for
              campus facility coordination.
            </p>
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ Club Role Navigation Pill Tabs ΓöÇΓöÇ */}
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

      {/* ΓöÇΓöÇ Notice / Feedback Alert Banner ΓöÇΓöÇ */}
      {notice && (
        <div
          className={`rounded-[22px] border p-4 text-xs flex items-start justify-between gap-3 shadow-xs transition-all ${
            notice.type === 'warning'
              ? 'border-[#F4DA69]/80 bg-[#FDF8E2] text-[#6B530E]'
              : notice.type === 'success'
              ? 'border-[#B9D9C2]/80 bg-[#E8F4EC] text-[#1F5433]'
              : 'border-[#B8CDEB]/80 bg-[#EDF3FB] text-[#24426E]'
          }`}
        >
          <div className="flex items-start gap-3">
            <Info
              className={`h-4 w-4 shrink-0 mt-0.5 ${
                notice.type === 'warning'
                  ? 'text-[#6B530E]'
                  : notice.type === 'success'
                  ? 'text-[#1F5433]'
                  : 'text-[#24426E]'
              }`}
            />
            <div className="space-y-0.5">
              <p className="font-extrabold text-[#1E1E1E]">{notice.title}</p>
              <p className="font-medium text-[#75716B] leading-relaxed">{notice.description}</p>
            </div>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded-full hover:bg-black/5 text-[#75716B] hover:text-[#1E1E1E] transition-colors cursor-pointer shrink-0"
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 1: Club Overview ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'club-overview' && (
        <div className="space-y-6">
          {bookingsError && (
            <ErrorAlert
              message={`Failed to load live booking requests: ${bookingsError}`}
              onRetry={refetchBookings}
            />
          )}

          {/* 4 Overview Stat Cards (Requirement 3: total, pending, approved, rejected) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Total Requests"
              value={bookingsLoading ? 'ΓÇª' : totalCount}
              icon={CalendarPlus}
              trend={
                bookingsLoading
                  ? 'Loading datasetΓÇª'
                  : selectedClub === 'All'
                  ? `${totalCount} requests across all clubs`
                  : `${totalCount} request${totalCount === 1 ? '' : 's'} recorded for ${selectedClub}`
              }
              color="indigo"
            />
            <StatCard
              title="Pending Requests"
              value={bookingsLoading ? 'ΓÇª' : pendingCount}
              icon={Clock}
              trend={
                bookingsLoading
                  ? 'LoadingΓÇª'
                  : pendingCount === 0
                  ? 'All requests evaluated by CP-SAT solver'
                  : `${pendingCount} awaiting solver batch run`
              }
              color="yellow"
            />
            <StatCard
              title="Approved Requests"
              value={bookingsLoading ? 'ΓÇª' : approvedCount}
              icon={CheckCircle2}
              trend={
                bookingsLoading
                  ? 'LoadingΓÇª'
                  : `${approvedCount} confirmed venue allocation${approvedCount === 1 ? '' : 's'}`
              }
              color="emerald"
            />
            <StatCard
              title="Rejected Requests"
              value={bookingsLoading ? 'ΓÇª' : rejectedCount}
              icon={XCircle}
              trend={
                bookingsLoading
                  ? 'LoadingΓÇª'
                  : `${rejectedCount} scheduling clash${rejectedCount === 1 ? '' : 'es'} flagged`
              }
              color="rose"
            />
          </div>

          {/* Highlight Strip for Alternatives Offered */}
          {alternativeCount > 0 && !bookingsLoading && (
            <div className="rounded-[22px] border border-[#B8CDEB]/70 bg-[#EDF3FB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-full bg-[#B8CDEB]/50 text-[#24426E]">
                  <ArrowRightLeft className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-extrabold text-[#24426E]">
                    {alternativeCount} Alternative Venue Offer{alternativeCount === 1 ? '' : 's'} Available
                  </p>
                  <p className="text-[11px] text-[#476694] font-medium">
                    The scheduling engine detected room collisions for primary preferences and suggested alternative available venues.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStatusFilter('alternative_offered');
                  handleTabClick('club-requests');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-[#24426E] border border-[#B8CDEB] text-xs font-bold hover:bg-[#F4F8FD] transition-colors self-start sm:self-auto cursor-pointer shadow-2xs"
              >
                <span>Review Alternatives</span>
                <span className="font-mono text-[10px] bg-[#B8CDEB]/40 px-1.5 py-0.5 rounded-full font-extrabold">
                  {alternativeCount}
                </span>
              </button>
            </div>
          )}

          {/* Secondary Actions & Allocation Rules Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions for Club Lead */}
            <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs space-y-4">
              <div>
                <h3 className="font-extrabold text-[#1E1E1E] text-sm">Club Representative Quick Actions</h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Streamlined workflows for student organization events
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => handleTabClick('club-submit')}
                  className="w-full text-left p-3.5 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] hover:bg-white hover:border-[#D8CFBF] transition-all flex items-center justify-between cursor-pointer group shadow-2xs"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold text-[#1E1E1E] group-hover:text-[#24426E] transition-colors">
                      New Venue Booking Request
                    </p>
                    <p className="text-[11px] text-[#75716B] font-medium">
                      Request Auditorium, Lab, Seminar Hall or OAT
                    </p>
                  </div>
                  <div className="p-2 rounded-full bg-white border border-[#E8E1D5] group-hover:border-[#24426E]/40 text-[#75716B] group-hover:text-[#24426E] transition-colors">
                    <CalendarPlus className="h-4 w-4" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setStatusFilter('all');
                    handleTabClick('club-requests');
                  }}
                  className="w-full text-left p-3.5 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] hover:bg-white hover:border-[#D8CFBF] transition-all flex items-center justify-between cursor-pointer group shadow-2xs"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold text-[#1E1E1E] group-hover:text-[#1F5433] transition-colors">
                      Track Solver Decision Reasons
                    </p>
                    <p className="text-[11px] text-[#75716B] font-medium">
                      Inspect allocated slots, conflict notes &amp; alternatives
                    </p>
                  </div>
                  <div className="p-2 rounded-full bg-white border border-[#E8E1D5] group-hover:border-[#1F5433]/40 text-[#75716B] group-hover:text-[#1F5433] transition-colors">
                    <CalendarCheck className="h-4 w-4" />
                  </div>
                </button>

                <div className="p-3.5 rounded-[18px] border border-dashed border-[#E8E1D5] bg-[#FFFDF8] text-[11px] text-[#75716B] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[#1E1E1E]">
                    <Sparkles className="h-3.5 w-3.5 text-[#E9A8CE]" />
                    <span>Scheduling Engine Advisory</span>
                  </div>
                  <p className="font-medium text-[#75716B]">
                    Academic curriculum lectures take hard precedence during Periods 1ΓÇô6 (08:00ΓÇô15:00). Club events booked in Periods 7ΓÇô9 or Saturdays experience 0% lecture clash risk.
                  </p>
                </div>
              </div>
            </div>

            {/* Institute Guidelines Card */}
            <div className="lg:col-span-2 bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs space-y-4">
              <div>
                <h3 className="font-extrabold text-[#1E1E1E] text-sm">
                  CIT Venue Allocation Rules for Student Clubs
                </h3>
                <p className="text-xs text-[#75716B] font-medium mt-0.5">
                  Key policies enforced by the automated campus scheduler and Estate Office
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-4 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-1.5 shadow-2xs">
                  <p className="font-bold text-[#1E1E1E] flex items-center gap-1.5">
                    <span>ΓÅ░</span>
                    <span>Lead Time &amp; Priority Tier</span>
                  </p>
                  <p className="text-[11px] text-[#75716B] font-medium leading-relaxed">
                    Evaluated hierarchically: Institute Events &gt; Dept Events &gt; Remedial Lectures &gt; Club Activities. Submit proposals at least 7 days before the event.
                  </p>
                </div>

                <div className="p-4 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-1.5 shadow-2xs">
                  <p className="font-bold text-[#1E1E1E] flex items-center gap-1.5">
                    <span>≡ƒÅ¢∩╕Å</span>
                    <span>Preferred Club Windows</span>
                  </p>
                  <p className="text-[11px] text-[#75716B] font-medium leading-relaxed">
                    Evenings (Periods 7ΓÇô9: 15:00 to 18:00) and full-day Saturdays are designated club hours to avoid colliding with credit coursework and labs.
                  </p>
                </div>

                <div className="p-4 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-1.5 shadow-2xs">
                  <p className="font-bold text-[#1E1E1E] flex items-center gap-1.5">
                    <span>≡ƒÄ¡</span>
                    <span>Spectra '27 Fest Blackouts</span>
                  </p>
                  <p className="text-[11px] text-[#75716B] font-medium leading-relaxed">
                    Main Auditorium (AUD) and open grounds (OAT) are reserved for cultural committee events and central auditions during annual college festival weeks.
                  </p>
                </div>

                <div className="p-4 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-1.5 shadow-2xs">
                  <p className="font-bold text-[#1E1E1E] flex items-center gap-1.5">
                    <span>≡ƒöä</span>
                    <span>Automated Alternative Rooms</span>
                  </p>
                  <p className="text-[11px] text-[#75716B] font-medium leading-relaxed">
                    If the primary venue choice has a schedule conflict, the CP-SAT engine dynamically checks capacity and recommends an equivalent available venue (e.g., SH-1 instead of AUD).
                  </p>
                </div>
              </div>

              {/* Recent Requests Preview */}
              <div className="pt-2 border-t border-[#E8E1D5]/60 flex items-center justify-between">
                <span className="text-xs text-[#75716B] font-medium">
                  Currently displaying {filteredBookings.length} booking request{filteredBookings.length === 1 ? '' : 's'} for {selectedClub}.
                </span>
                <button
                  onClick={() => handleTabClick('club-requests')}
                  className="text-xs font-bold text-[#1E1E1E] hover:underline cursor-pointer"
                >
                  View All Requests ΓåÆ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 2: Submit Venue Request (Clean Booking Form) ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'club-submit' && (
        <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-6 sm:p-8 shadow-xs space-y-6">
          {/* Form Notice Banner */}
          <div className="rounded-[22px] border border-[#F4DA69]/80 bg-[#FDF8E2] p-4 text-xs text-[#6B530E] flex items-start gap-3 shadow-xs">
            <AlertCircle size={18} className="text-[#6B530E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold text-[#4A3805]">
                Prototype Submission Interface ΓÇö Backend API Pending
              </p>
              <p className="font-medium text-[#6B530E] leading-relaxed">
                This form captures venue requirements for club events and validates parameters locally. In production, requests are dispatched to the scheduling solver via <code>POST /api/bookings/requests</code>. Submissions in this preview mode validate all form inputs locally without altering the live dataset or fabricating unpersisted records.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-black text-[#1E1E1E] tracking-tight">
              Submit New Club Venue Booking Request
            </h2>
            <p className="text-xs sm:text-sm text-[#75716B] font-medium mt-0.5">
              Specify your event details, attendee capacity, and preferred schedule for automated solver review.
            </p>
          </div>

          {/* Natural Language Prompt Assistant (Review & Edit before submission) */}
          <div className="rounded-[22px] border border-[#B8CDEB]/70 bg-[#EDF3FB] p-4.5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#24426E]" />
              <p className="font-extrabold text-[#24426E] text-xs">
                Quick-Fill via Gemini Natural Language Parser (Review &amp; Edit)
              </p>
            </div>
            <p className="text-[11px] text-[#476694] font-medium leading-relaxed">
              Type your requirements in plain English or Hinglish (e.g., &ldquo;Coding club wants CS-LAB-1 for a 6-hour hackathon on Saturday with 70 participants and projector&rdquo;). Gemini will populate the form fields below for your review and editing before submission.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Robotics Club needs electrical lab on Friday 3 pm for 40 students with sound system"
                className="flex-1 rounded-full border border-[#B8CDEB] bg-white px-4 py-2 text-xs font-medium text-[#1E1E1E] focus:outline-none focus:border-[#24426E]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleParseAiPrompt();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleParseAiPrompt}
                disabled={aiParsing || !aiPrompt.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] px-4 py-2 text-xs font-bold text-white hover:bg-black transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {aiParsing ? (
                  <>
                    <RefreshCw size={12} className="animate-spin text-[#E9A8CE]" />
                    <span>Parsing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={12} className="text-[#E9A8CE]" />
                    <span>Parse with Gemini</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmitBookingForm} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              {/* Event Title */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-bold text-[#1E1E1E] block">
                  Event Title <span className="text-[#E9A8CE]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Spectra Code Sprint ΓÇô 8-Hour Competitive Hackathon"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] placeholder:text-[#A39E95] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* Event Category */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#1E1E1E] block">Event Category</label>
                <select
                  value={eventCategory}
                  onChange={(e) => setEventCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs cursor-pointer"
                >
                  <option value="Hackathon / Competition">Hackathon / Coding Competition</option>
                  <option value="Workshop & Hands-on Training">Workshop &amp; Hands-on Training</option>
                  <option value="Cultural / Performing Arts">Cultural / Performing Arts</option>
                  <option value="Guest Lecture / Tech Talk">Guest Lecture / Tech Talk</option>
                  <option value="Quiz & Academic Competition">Quiz &amp; Academic Competition</option>
                  <option value="Exhibition / Showcase">Exhibition / Showcase</option>
                  <option value="General Body Meeting">General Body Meeting (GBM)</option>
                </select>
              </div>

              {/* Organizing Club */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#1E1E1E] block">Organizing Club</label>
                <input
                  type="text"
                  value={selectedClub === 'All' ? clubName : selectedClub}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="e.g. Coding Club, Robotics Club..."
                  disabled={selectedClub !== 'All'}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] disabled:opacity-80 disabled:cursor-not-allowed focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* Expected Attendees */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#1E1E1E] block">Expected Attendance (Seats)</label>
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={attendance}
                  onChange={(e) => setAttendance(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* Required Room Type */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#1E1E1E] block">Required Room Category</label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs cursor-pointer"
                >
                  <option value="lab_cs">Computing Lab (CS-LAB-1 / CS-LAB-2)</option>
                  <option value="seminar_hall">Seminar Hall (SH-1 / SH-2 ΓÇö 120 seats)</option>
                  <option value="auditorium">Main Auditorium (AUD ΓÇö 400 seats)</option>
                  <option value="lecture_hall">Lecture Hall (LH-101 / LH-102)</option>
                  <option value="lab_elec">Electronics Laboratory</option>
                  <option value="outdoor">Open Air Theatre (OAT / Grounds)</option>
                </select>
              </div>

              {/* Specific Preferred Venue */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#1E1E1E] block">Preferred Specific Venue (Optional)</label>
                <select
                  value={preferredRoom}
                  onChange={(e) => setPreferredRoom(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs cursor-pointer"
                >
                  {roomsData?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id}) ΓÇö {r.capacity} seats ΓÇó {r.type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preferred Day */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#1E1E1E] block">Preferred Day</label>
                <select
                  value={preferredDay}
                  onChange={(e) => setPreferredDay(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs cursor-pointer"
                >
                  <option value="SAT">Saturday (Recommended ΓÇö Non-Academic Day)</option>
                  <option value="FRI">Friday Evening</option>
                  <option value="WED">Wednesday Afternoon</option>
                  <option value="THU">Thursday Evening</option>
                  <option value="TUE">Tuesday Evening</option>
                  <option value="MON">Monday Evening</option>
                </select>
              </div>

              {/* Preferred Time Window / Period */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-bold text-[#1E1E1E] block">Target Time Slot / Period Window</label>
                <select
                  value={preferredPeriod}
                  onChange={(e) => setPreferredPeriod(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs cursor-pointer"
                >
                  <option value="7">Periods 7ΓÇô9: 15:00 ΓÇô 18:00 (Evening ΓÇö Club Prime Slot, 0% Clash)</option>
                  <option value="6">Periods 6ΓÇô7: 14:00 ΓÇô 16:00 (Afternoon Transition)</option>
                  <option value="1">Full Day: 08:00 ΓÇô 17:00 (Saturday Hackathon / Multi-hour Workshop)</option>
                  <option value="2">Periods 2ΓÇô4: 09:00 ΓÇô 12:00 (Saturday Morning)</option>
                </select>
              </div>

              {/* Facility Requirements Checkboxes */}
              <div className="space-y-2 md:col-span-2 pt-2 border-t border-[#E8E1D5]/60">
                <label className="font-bold text-[#1E1E1E] block">Required Facilities &amp; Equipment</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] hover:bg-white cursor-pointer transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={soundSystemNeeded}
                      onChange={(e) => setSoundSystemNeeded(e.target.checked)}
                      className="rounded border-[#E8E1D5] text-[#151515] focus:ring-[#151515]"
                    />
                    <span className="font-semibold text-[#1E1E1E] flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5 text-[#75716B]" />
                      <span>Sound / Mic</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] hover:bg-white cursor-pointer transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={projectorNeeded}
                      onChange={(e) => setProjectorNeeded(e.target.checked)}
                      className="rounded border-[#E8E1D5] text-[#151515] focus:ring-[#151515]"
                    />
                    <span className="font-semibold text-[#1E1E1E] flex items-center gap-1.5">
                      <Tv className="h-3.5 w-3.5 text-[#75716B]" />
                      <span>HD Projector</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] hover:bg-white cursor-pointer transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={acNeeded}
                      onChange={(e) => setAcNeeded(e.target.checked)}
                      className="rounded border-[#E8E1D5] text-[#151515] focus:ring-[#151515]"
                    />
                    <span className="font-semibold text-[#1E1E1E] flex items-center gap-1.5">
                      <Wind className="h-3.5 w-3.5 text-[#75716B]" />
                      <span>Air Conditioning</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] hover:bg-white cursor-pointer transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={wifiNeeded}
                      onChange={(e) => setWifiNeeded(e.target.checked)}
                      className="rounded border-[#E8E1D5] text-[#151515] focus:ring-[#151515]"
                    />
                    <span className="font-semibold text-[#1E1E1E] flex items-center gap-1.5">
                      <Wifi className="h-3.5 w-3.5 text-[#75716B]" />
                      <span>High-Speed WiFi</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Description & Justification */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-bold text-[#1E1E1E] block">
                  Event Description &amp; Equipment Justification
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide an overview of the event, agenda, equipment requirements, and justification for the requested venue..."
                  className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-3 text-xs font-semibold text-[#1E1E1E] placeholder:text-[#A39E95] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs resize-none"
                />
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-[#E8E1D5]/60">
              <span className="text-[11px] text-[#A39E95] font-medium">
                Form inputs are validated locally. Database mutations require backend endpoint deployment.
              </span>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Form</span>
                </button>

                <button
                  type="submit"
                  disabled={submittingBooking}
                  className="inline-flex items-center gap-2 rounded-full bg-[#151515] hover:bg-[#333] px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingBooking ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#E9A8CE]" />
                      <span>Validating with Solver...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5 text-[#E9A8CE]" />
                      <span>Submit Request (CP-SAT Solver Validation)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ TAB 3: My Requests & Status Tracking ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {currentTab === 'club-requests' && (
        <div className="space-y-4">
          {/* Header Bar with Search & Filters */}
          <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-[#1E1E1E] text-base">
                  Evaluated Venue Requests &amp; Solver Decisions ({filteredBookings.length})
                </h3>
                {!bookingsLoading && !bookingsError && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1F5433] bg-[#B9D9C2]/35 border border-[#B9D9C2]/80 rounded-full px-2.5 py-0.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Live CP-SAT Decisions
                  </span>
                )}
              </div>
              <p className="text-xs text-[#75716B] font-medium mt-0.5">
                Track assigned facilities, alternative room offers, and constraint solver notes.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A39E95]" />
                <input
                  type="text"
                  placeholder="Search by title, ID, room..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full border border-[#E8E1D5] bg-[#FAF6ED] pl-8 pr-4 py-2 text-xs font-semibold text-[#1E1E1E] placeholder:text-[#A39E95] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs w-full sm:w-56"
                />
              </div>

              {/* Refresh Decisions Button */}
              <button
                onClick={() => refetchBookings()}
                disabled={bookingsLoading}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 text-xs font-bold text-[#1E1E1E] shadow-2xs hover:bg-white transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    bookingsLoading ? 'animate-spin text-[#E9A8CE]' : 'text-[#75716B]'
                  }`}
                />
                <span>{bookingsLoading ? 'EvaluatingΓÇª' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Status Filter Pill Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all' as const, label: 'All Requests', count: filteredBookings.length },
              { id: 'approved' as const, label: 'Approved', count: approvedCount },
              { id: 'alternative_offered' as const, label: 'Alternative Offered', count: alternativeCount },
              { id: 'rejected' as const, label: 'Rejected / Clashes', count: rejectedCount },
              { id: 'pending' as const, label: 'Pending Evaluation', count: pendingCount },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-[#151515] text-white shadow-2xs'
                    : 'bg-[#FFFDF8] text-[#75716B] border border-[#E8E1D5] hover:text-[#1E1E1E] hover:bg-[#FAF6ED]'
                }`}
              >
                <span>{st.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                    statusFilter === st.id
                      ? 'bg-white/20 text-white'
                      : 'bg-[#FAF6ED] text-[#75716B] border border-[#E8E1D5]'
                  }`}
                >
                  {st.count}
                </span>
              </button>
            ))}
          </div>

          {/* Live Data Content */}
          {bookingsLoading ? (
            <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-12 shadow-xs">
              <LoadingSpinner message="Evaluating venue booking requests with backend engine (/api/bookings/process)ΓÇª Checking room availability and academic lecture conflicts." />
            </div>
          ) : bookingsError ? (
            <ErrorAlert message={bookingsError} onRetry={refetchBookings} />
          ) : displayRequests.length === 0 ? (
            <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-12 text-center text-[#75716B] shadow-xs space-y-2">
              <Building2 className="h-8 w-8 text-[#A39E95] mx-auto opacity-50" />
              <p className="text-sm font-bold text-[#1E1E1E]">No venue requests match your filters</p>
              <p className="text-xs text-[#A39E95]">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try clearing the search query or status filter.'
                  : `No booking requests recorded for ${selectedClub}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayRequests.map((b: ProcessedBooking) => {
                const isApproved = b.status === 'approved';
                const isAlt = b.status === 'alternative_offered';
                const isRejected = b.status === 'rejected';
                const isPending = b.status === 'pending';

                // Requirement 6: Can this request be cancelled logically?
                // Only active bookings (approved, alt offered, pending) can be cancelled. Rejected cannot.
                const isCancellable = !isRejected;

                return (
                  <div
                    key={b.id}
                    className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 sm:p-6 shadow-xs hover:border-[#D8CFBF] transition-all space-y-4"
                  >
                    {/* Top Row: Meta Badges + Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E8E1D5]/60 pb-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-1 rounded-lg">
                          {b.id}
                        </span>
                        <span className="text-xs font-bold text-white bg-[#151515] px-2.5 py-1 rounded-full">
                          {b.requester}
                        </span>
                        {b.attendance && (
                          <span className="text-xs font-semibold text-[#75716B] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <Users className="h-3 w-3 text-[#A39E95]" />
                            <span>{b.attendance} attendees</span>
                          </span>
                        )}
                        {b.requested_category && (
                          <span className="text-[11px] font-semibold text-[#75716B] bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full capitalize">
                            {b.requested_category.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold shadow-2xs ${
                            isApproved
                              ? 'bg-[#B9D9C2]/45 text-[#1F5433] border border-[#B9D9C2]/80'
                              : isAlt
                              ? 'bg-[#B8CDEB]/45 text-[#24426E] border border-[#B8CDEB]/80'
                              : isRejected
                              ? 'bg-[#E9A8CE]/40 text-[#732450] border border-[#E9A8CE]/80'
                              : 'bg-[#F4DA69]/40 text-[#6B530E] border border-[#F4DA69]/80'
                          }`}
                        >
                          {isApproved && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {isAlt && <ArrowRightLeft className="h-3.5 w-3.5" />}
                          {isRejected && <XCircle className="h-3.5 w-3.5" />}
                          {isPending && <Clock className="h-3.5 w-3.5" />}
                          <span>
                            {isApproved
                              ? 'Approved'
                              : isAlt
                              ? 'Alternative Offered'
                              : isRejected
                              ? 'Rejected / Conflict'
                              : 'Pending Solver'}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Event Title */}
                    <div>
                      <h4 className="text-base sm:text-lg font-black text-[#1E1E1E] tracking-tight">
                        {b.title}
                      </h4>
                    </div>

                    {/* Middle Info Grid (3 Columns) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {/* Col 1: Requested Venue & Schedule */}
                      <div className="p-3.5 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-1">
                        <span className="text-[#75716B] font-bold text-[11px] block uppercase tracking-wider">
                          Requested Preference
                        </span>
                        <div className="font-extrabold text-[#1E1E1E] flex items-center gap-1.5 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 text-[#E9A8CE]" />
                          <span>
                            {b.requested_room ??
                              (b.room_types && b.room_types.length > 0
                                ? b.room_types.join(', ')
                                : 'Any suitable room')}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#75716B] font-medium">
                          Preference: {b.requested_category?.replace('_', ' ') ?? 'Club Activity'}
                        </p>
                      </div>

                      {/* Col 2: Allocated Result */}
                      <div className="p-3.5 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-1">
                        <span className="text-[#75716B] font-bold text-[11px] block uppercase tracking-wider">
                          Solver Allocation Result
                        </span>
                        {b.allocated ? (
                          <div className="space-y-0.5 mt-0.5">
                            <span className="font-extrabold text-[#1F5433] flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#1F5433]" />
                              <span>
                                {b.allocated.room_id} ΓÇó {b.allocated.day}
                              </span>
                            </span>
                            <p className="text-[11px] text-[#1F5433]/80 font-semibold">
                              Periods {b.allocated.start_period}ΓÇô{b.allocated.end_period} (
                              {formatSlotTime(b.allocated.start_period, b.allocated.end_period)})
                            </p>
                          </div>
                        ) : b.alternative ? (
                          <div className="space-y-0.5 mt-0.5">
                            <span className="font-extrabold text-[#24426E] flex items-center gap-1.5">
                              <ArrowRightLeft className="h-3.5 w-3.5 text-[#24426E]" />
                              <span>
                                Alt: {b.alternative.room_id} ΓÇó {b.alternative.day}
                              </span>
                            </span>
                            <p className="text-[11px] text-[#24426E]/80 font-semibold">
                              Periods {b.alternative.start_period}ΓÇô{b.alternative.end_period} (
                              {formatSlotTime(b.alternative.start_period, b.alternative.end_period)})
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-0.5 mt-0.5">
                            <span className="font-extrabold text-[#732450] flex items-center gap-1.5">
                              <XCircle className="h-3.5 w-3.5 text-[#732450]" />
                              <span>No venue allocated</span>
                            </span>
                            <p className="text-[11px] text-[#732450]/80 font-medium">
                              Schedule collision with higher priority event
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Col 3: Cancellation Controls (Requirement 6) */}
                      <div className="p-3.5 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] flex flex-col justify-between">
                        <span className="text-[#75716B] font-bold text-[11px] block uppercase tracking-wider">
                          Booking Management
                        </span>

                        <div className="mt-2">
                          {isCancellable ? (
                            <div className="space-y-1">
                              <button
                                onClick={() => handleOpenCancelDialog(b)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-[#E9A8CE] bg-white px-3.5 py-1.5 text-xs font-bold text-[#732450] hover:bg-[#E9A8CE]/20 transition-colors cursor-pointer shadow-2xs"
                                title="Simulate cancelling this booking reservation"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Cancel Booking (Simulation)</span>
                              </button>
                              <p className="text-[10px] text-[#A39E95] font-medium">
                                Dev Preview: Simulates cancellation flow
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#E8E1D5]/40 px-2.5 py-1 text-[11px] font-bold text-[#75716B]">
                                Non-actionable (Request Rejected)
                              </span>
                              <p className="text-[10px] text-[#A39E95] font-medium">
                                Rejected proposals require new submission
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Solver Decision Reason / Alternative Offered Box */}
                    {b.reasons && b.reasons.length > 0 && (
                      <div
                        className={`rounded-[18px] p-3.5 text-xs flex items-start gap-2.5 border ${
                          isAlt
                            ? 'bg-[#EDF3FB] border-[#B8CDEB]/70 text-[#24426E]'
                            : isRejected
                            ? 'bg-[#FDF2F7] border-[#E9A8CE]/70 text-[#732450]'
                            : 'bg-[#FAF6ED] border-[#E8E1D5] text-[#1E1E1E]'
                        }`}
                      >
                        {isAlt ? (
                          <ArrowRightLeft className="h-4 w-4 text-[#24426E] shrink-0 mt-0.5" />
                        ) : isRejected ? (
                          <AlertCircle className="h-4 w-4 text-[#732450] shrink-0 mt-0.5" />
                        ) : (
                          <Info className="h-4 w-4 text-[#75716B] shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5 leading-relaxed">
                          <span className="font-extrabold">
                            {isAlt
                              ? 'Alternative Room Recommendation: '
                              : isRejected
                              ? 'Solver Conflict Note: '
                              : 'Solver Allocation Note: '}
                          </span>
                          <span className="font-medium">{b.reasons.join('; ')}</span>
                        </div>
                      </div>
                    )}

                    {/* Original Raw Request Justification (if present in dataset) */}
                    {b.raw_text && (
                      <div className="text-[11px] text-[#75716B] font-medium italic pt-1 border-t border-[#E8E1D5]/40">
                        Original Request: &ldquo;{b.raw_text}&rdquo;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* ΓöÇΓöÇ Cancellation Simulation Modal Dialog (Requirement 6) ΓöÇΓöÇ */}
      {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
      {/* Pre-Submission Review & Confirmation Modal */}
      {reviewModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[28px] bg-[#FFFDF8] p-6 shadow-2xl border border-[#E8E1D5] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D5] pb-3.5">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] text-white px-3 py-0.5 text-xs font-bold shadow-2xs">
                  <CheckCircle2 size={13} className="text-[#E9A8CE]" />
                  <span>Review Booking Details</span>
                </span>
                <h3 className="text-lg font-extrabold text-[#1E1E1E] mt-1.5 leading-snug">
                  {reviewModalData.payload.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalData(null)}
                className="rounded-full p-1.5 text-[#75716B] hover:text-[#1E1E1E] hover:bg-[#FAF6ED] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div
              className={
                'p-3.5 rounded-2xl border text-xs space-y-1.5 ' +
                (reviewModalData.validation.status === 'approved'
                  ? 'bg-[#EAF5ED] border-[#B9D9C2] text-[#1E5C32]'
                  : reviewModalData.validation.status === 'alternative_offered'
                  ? 'bg-[#E8F0FC] border-[#B8CDEB] text-[#1E4378]'
                  : 'bg-[#FCF2F7] border-[#E9A8CE] text-[#7A1F52]')
              }
            >
              <div className="flex items-center justify-between font-extrabold uppercase text-[11px]">
                <span className="flex items-center gap-1.5">
                  {reviewModalData.validation.status === 'approved' && <CheckCircle2 size={14} />}
                  {reviewModalData.validation.status === 'alternative_offered' && <ArrowRightLeft size={14} />}
                  {reviewModalData.validation.status === 'rejected' && <XCircle size={14} />}
                  <span>CP-SAT Solver Status: {reviewModalData.validation.status.replace('_', ' ')}</span>
                </span>
                <span className="text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-white/70">
                  Pre-Submission Validated
                </span>
              </div>
              <p className="font-medium text-xs leading-relaxed">
                {reviewModalData.validation.reasons?.join('; ') || 'All curriculum constraints, capacity limits, and time windows satisfied.'}
              </p>
              {reviewModalData.validation.status === 'alternative_offered' && reviewModalData.validation.alternative && (
                <div className="mt-1 pt-1 border-t border-[#B8CDEB] text-xs font-bold text-[#1E4378]">
                  Suggested Alternative: {reviewModalData.validation.alternative.room_id} on {reviewModalData.validation.alternative.day} (Period {reviewModalData.validation.alternative.start_period} to {reviewModalData.validation.alternative.end_period})
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#E8E1D5] bg-[#FAF6ED]/50 p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#75716B] font-semibold">Club / Organization:</span>
                <strong className="text-[#1E1E1E]">{reviewModalData.payload.requester}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#75716B] font-semibold">Target Facility:</span>
                <strong className="text-[#1E1E1E]">{reviewModalData.roomLabel} ({reviewModalData.payload.requested_room})</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#75716B] font-semibold">Scheduled Window:</span>
                <span className="font-bold text-[#1E1E1E]">
                  {reviewModalData.payload.windows[0]?.day} - Period {reviewModalData.payload.windows[0]?.from_period} to {reviewModalData.payload.windows[0]?.to_period}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#75716B] font-semibold">Expected Attendees:</span>
                <span className="font-bold text-[#1E1E1E]">{reviewModalData.payload.attendance} members</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#75716B] font-semibold">Equipment Requested:</span>
                <span className="font-bold text-[#1E1E1E]">
                  {reviewModalData.payload.needs.join(', ') || 'Standard room equipment'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8E1D5] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setReviewModalData(null)}
                className="rounded-full border border-[#E8E1D5] bg-[#FAF6ED] px-4 py-2 text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
              >
                Edit Parameters
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitBooking}
                disabled={confirmSubmitting}
                className="inline-flex items-center gap-2 rounded-full bg-[#151515] hover:bg-[#333] px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {confirmSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#E9A8CE]" />
                    <span>Submitting to Database...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 text-[#E9A8CE]" />
                    <span>Confirm &amp; Submit Booking</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {bookingToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#FFFDF8] rounded-[26px] border border-[#E8E1D5] p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-2 py-0.5 rounded">
                    {bookingToCancel.id}
                  </span>
                  <span className="text-xs font-bold text-[#732450] bg-[#E9A8CE]/35 border border-[#E9A8CE]/80 rounded-full px-2.5 py-0.5">
                    Dev Preview Simulation
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-[#1E1E1E] mt-1">
                  Simulate Booking Cancellation
                </h3>
              </div>
              <button
                onClick={() => setBookingToCancel(null)}
                className="p-1.5 rounded-full hover:bg-[#FAF6ED] text-[#75716B] hover:text-[#1E1E1E] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Target Booking Info Card */}
            <div className="p-4 rounded-[18px] border border-[#E8E1D5] bg-[#FAF6ED] space-y-2 text-xs">
              <p className="font-black text-[#1E1E1E] text-sm">{bookingToCancel.title}</p>
              <div className="grid grid-cols-2 gap-2 text-[#75716B] font-medium pt-1 border-t border-[#E8E1D5]/60">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#A39E95] block">
                    Venue Target:
                  </span>
                  <span className="font-bold text-[#1E1E1E]">
                    {bookingToCancel.allocated?.room_id ??
                      bookingToCancel.alternative?.room_id ??
                      bookingToCancel.requested_room ??
                      'Pending'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#A39E95] block">
                    Current Status:
                  </span>
                  <span className="font-bold capitalize text-[#1E1E1E]">
                    {bookingToCancel.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Explanation Notice */}
            <div className="rounded-[18px] border border-[#F4DA69]/80 bg-[#FDF8E2] p-3.5 text-xs text-[#6B530E] flex items-start gap-2.5">
              <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold text-[#4A3805]">Simulated Action Notice</p>
                <p className="font-medium text-[#6B530E] leading-relaxed">
                  The persistent backend cancellation endpoint (<code>DELETE /api/bookings/{'{id}'}</code>)
                  is pending backend deployment. Confirming this simulation tests the representative
                  cancellation interface without modifying the permanent scheduling dataset.
                </p>
              </div>
            </div>

            {/* Optional Cancellation Reason */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-[#1E1E1E] block">
                Reason for Cancellation (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Event rescheduled, alternative off-campus venue arranged..."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full rounded-xl border border-[#E8E1D5] bg-[#FAF6ED] p-2.5 text-xs font-semibold text-[#1E1E1E] placeholder:text-[#A39E95] focus:outline-none focus:border-[#E9A8CE] focus:bg-white transition-all shadow-2xs"
              />
            </div>

            {/* Dialog Footer Actions */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E8E1D5]/60">
              <button
                type="button"
                onClick={() => setBookingToCancel(null)}
                className="px-4 py-2 rounded-full border border-[#E8E1D5] bg-[#FAF6ED] text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] hover:bg-white transition-colors cursor-pointer"
              >
                Keep Booking
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelSimulation}
                className="px-4 py-2 rounded-full bg-[#151515] hover:bg-[#333] text-xs font-bold text-white transition-colors cursor-pointer shadow-xs"
              >
                Simulate Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}