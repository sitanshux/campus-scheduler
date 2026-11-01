import { useState } from 'react';
import {
  CalendarCheck,
  Filter,
  Users,
  MapPin,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  XCircle,
  Clock,
  RefreshCw,
  Info,
} from 'lucide-react';
import { fetchFullBookings } from '../services/api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';
import type { ProcessedBooking } from '../types';

const statusTabs = [
  'All',
  'Approved',
  'Alternative Offered',
  'Rejected',
  'Pending',
] as const;

type StatusTab = (typeof statusTabs)[number];

const statusBadgeStyles: Record<string, { bg: string; icon: typeof CheckCircle2; label: string }> = {
  approved: {
    bg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    icon: CheckCircle2,
    label: 'Approved',
  },
  alternative_offered: {
    bg: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
    icon: ArrowRightLeft,
    label: 'Alternative Offered',
  },
  rejected: {
    bg: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
    icon: XCircle,
    label: 'Rejected',
  },
  pending: {
    bg: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
    icon: Clock,
    label: 'Pending',
  },
};

const categoryStyles: Record<string, string> = {
  guest_lecture: 'bg-indigo-50 text-indigo-700',
  club_event: 'bg-violet-50 text-violet-700',
  workshop: 'bg-cyan-50 text-cyan-700',
  seminar: 'bg-emerald-50 text-emerald-700',
  meeting: 'bg-slate-100 text-slate-700',
  cultural: 'bg-pink-50 text-pink-700',
  sports: 'bg-orange-50 text-orange-700',
  exam: 'bg-amber-50 text-amber-700',
  department_event: 'bg-blue-50 text-blue-700',
  institute_event: 'bg-purple-50 text-purple-700',
};

function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<StatusTab>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: bookingsData,
    loading,
    error,
    refetch,
  } = useApi(fetchFullBookings);

  const bookings: ProcessedBooking[] = bookingsData?.bookings ?? [];
  const summary = bookingsData?.summary ?? {
    approved: 0,
    rejected: 0,
    alternative_offered: 0,
    pending: 0,
  };

  const filteredBookings = bookings.filter((booking) => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Approved') return booking.status === 'approved';
    if (activeTab === 'Alternative Offered') return booking.status === 'alternative_offered';
    if (activeTab === 'Rejected') return booking.status === 'rejected';
    if (activeTab === 'Pending') return booking.status === 'pending';
    return true;
  });

  const getTabCount = (tab: StatusTab): number => {
    switch (tab) {
      case 'All':
        return bookings.length;
      case 'Approved':
        return summary.approved;
      case 'Alternative Offered':
        return summary.alternative_offered;
      case 'Rejected':
        return summary.rejected;
      case 'Pending':
        return summary.pending;
      default:
        return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Venue Booking Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Deterministic evaluation and venue allocation for all campus booking requests
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Re-run engine evaluations"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-evaluate</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && !bookingsData && (
        <ErrorAlert message={error} onRetry={refetch} />
      )}

      {/* Loading state */}
      {loading && !bookingsData && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <LoadingSpinner message="Evaluating venue booking requests and allocations…" />
        </div>
      )}

      {/* Main content when data is ready */}
      {(!loading || bookingsData) && (
        <>
          {/* Status Filter Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {statusTabs.map((tab) => {
                const count = getTabCount(tab);
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{tab}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isActive
                          ? 'bg-indigo-500/40 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 self-end sm:self-auto">
              <Filter className="h-3.5 w-3.5" />
              <span>Status filter</span>
            </div>
          </div>

          {/* Count Summary */}
          <div className="text-sm text-slate-500 flex items-center justify-between">
            <div>
              Showing <span className="font-semibold text-slate-700">{filteredBookings.length}</span> of{' '}
              <span className="font-semibold text-slate-700">{bookings.length}</span> requests
              {activeTab === 'All' && (
                <span className="text-slate-400 ml-1">
                  ({summary.approved} approved, {summary.alternative_offered} alternative, {summary.rejected} rejected)
                </span>
              )}
            </div>
          </div>

          {/* Booking Cards */}
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const statusMeta = statusBadgeStyles[booking.status] ?? statusBadgeStyles.pending;
              const StatusIcon = statusMeta.icon;
              const catStyle =
                categoryStyles[booking.requested_category] || 'bg-slate-100 text-slate-700';
              const isExpanded = expandedId === booking.id;

              return (
                <div
                  key={booking.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col gap-3">
                    {/* Header Row: ID, Title, Status badge, Category badge */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {booking.id}
                          </span>
                          <h3 className="font-semibold text-slate-900 text-base">
                            {booking.title}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.bg}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusMeta.label}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${catStyle}`}
                          >
                            {formatCategory(booking.requested_category)}
                          </span>
                        </div>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 pt-1">
                          <div>
                            Requested by{' '}
                            <span className="font-medium text-slate-700">
                              {booking.requester}
                            </span>
                            <span className="text-slate-400 text-xs ml-1 capitalize">
                              ({booking.role.replace(/_/g, ' ')})
                            </span>
                            {booking.department && (
                              <span className="text-slate-400 text-xs ml-1">
                                · Dept: {booking.department}
                              </span>
                            )}
                          </div>

                          <span className="hidden sm:inline text-slate-300">•</span>

                          <div className="flex items-center gap-1.5">
                            <CalendarCheck className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {booking.day} · {booking.timeSlot}
                            </span>
                          </div>

                          <span className="hidden sm:inline text-slate-300">•</span>

                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              Attendance: <span className="font-medium text-slate-700">{booking.attendance}</span>
                            </span>
                          </div>
                        </div>

                        {/* Venue Information */}
                        <div className="flex items-center gap-2 pt-1 text-sm text-slate-600 flex-wrap">
                          <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="text-slate-500">Venue:</span>

                          {booking.status === 'approved' && (
                            <span className="font-semibold text-slate-900">{booking.venue}</span>
                          )}

                          {booking.status === 'alternative_offered' && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sky-800">{booking.venue}</span>
                              {booking.requested_room && (
                                <span className="text-xs text-slate-400">
                                  (Requested: {booking.requested_room})
                                </span>
                              )}
                            </div>
                          )}

                          {booking.status === 'rejected' && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-400">None Allocated</span>
                              {(booking.requested_room || (booking.room_types && booking.room_types.length > 0)) && (
                                <span className="text-xs text-slate-400">
                                  (Requested: {booking.requested_room || booking.room_types.join(', ')})
                                </span>
                              )}
                            </div>
                          )}

                          {booking.status === 'pending' && (
                            <span className="font-medium text-slate-700">{booking.venue}</span>
                          )}
                        </div>

                        {/* Special Needs Badges */}
                        {booking.needs && booking.needs.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                            <span className="text-slate-400">Needs:</span>
                            {booking.needs.map((need) => (
                              <span
                                key={need}
                                className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                              >
                                {need}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rejection Reasons Alert Box */}
                    {booking.status === 'rejected' && booking.reasons.length > 0 && (
                      <div className="mt-2 flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200/80 p-3 text-xs text-rose-800">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-semibold text-rose-900">Rejection Reason</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {booking.reasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Alternative Offer Notice Box */}
                    {booking.status === 'alternative_offered' && booking.reasons.length > 0 && (
                      <div className="mt-2 flex items-start gap-2.5 rounded-lg bg-sky-50 border border-sky-200/80 p-3 text-xs text-sky-800">
                        <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-semibold text-sky-900">Alternative Offer Note</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {booking.reasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Approved Confirmation Note */}
                    {booking.status === 'approved' && booking.reasons.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{booking.reasons.join('; ')}</span>
                      </div>
                    )}

                    {/* Raw Text Toggle */}
                    {booking.raw_text && (
                      <div className="pt-2 border-t border-slate-100 mt-1">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          {isExpanded ? 'Hide request details' : 'Show request details'}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200/60 font-mono whitespace-pre-wrap">
                            {booking.raw_text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredBookings.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <CalendarCheck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  No booking requests found for the selected filter.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Try selecting &quot;All&quot; or another status filter tab.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
