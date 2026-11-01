import { Loader2, ArrowRight } from 'lucide-react';
import type { BookingRequest } from '../../types';

interface RecentBookingsProps {
  bookings: BookingRequest[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate?: (page: string) => void;
}

const statusClasses = {
  pending: 'bg-[#F4DA69]/30 text-[#6B530E] border border-[#F4DA69]/50',
  approved: 'bg-[#B9D9C2]/35 text-[#1B4D2E] border border-[#B9D9C2]/60',
  rejected: 'bg-[#E9A8CE]/30 text-[#7D2956] border border-[#E9A8CE]/50',
} as const;

function formatDateTime(date: string, timeSlot: string) {
  const d = new Date(date);
  const formatted = isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  return `${formatted} • ${timeSlot}`;
}

export default function RecentBookings({
  bookings,
  loading = false,
  error = null,
  onRetry,
  onNavigate,
}: RecentBookingsProps) {
  return (
    <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] shadow-xs overflow-hidden flex flex-col">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-5 sm:px-6 py-4 border-b border-[#E8E1D5] bg-[#FAF6ED]/40 gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-[#1E1E1E] tracking-tight">
            Recent Booking Requests
          </h2>
          <p className="text-xs text-[#75716B] mt-0.5 font-medium">
            Live campus venue requests from clubs and academic coordinators
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.('bookings')}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-[#1E1E1E] hover:bg-black text-white px-3.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span>View All Requests</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-5 sm:px-6 py-3 border-b border-[#E9A8CE]/30 bg-[#E9A8CE]/15 flex items-center justify-between gap-3 text-xs text-[#7D2956]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold shrink-0">Error loading bookings:</span>
            <span className="truncate">{error}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs font-bold text-[#7D2956] hover:underline shrink-0 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Table with responsive horizontal scroll container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[#E8E1D5] bg-[#FAF6ED]">
              <th className="w-[110px] text-[#75716B] font-bold uppercase text-[11px] tracking-wider px-5 py-3 whitespace-nowrap">
                Request ID
              </th>
              <th className="min-w-[190px] text-[#75716B] font-bold uppercase text-[11px] tracking-wider px-5 py-3">
                Event Title
              </th>
              <th className="w-[140px] text-[#75716B] font-bold uppercase text-[11px] tracking-wider px-5 py-3 whitespace-nowrap">
                Requested By
              </th>
              <th className="w-[130px] text-[#75716B] font-bold uppercase text-[11px] tracking-wider px-5 py-3 whitespace-nowrap">
                Venue
              </th>
              <th className="w-[180px] min-w-[180px] text-[#75716B] font-bold uppercase text-[11px] tracking-wider px-5 py-3 whitespace-nowrap">
                Date &amp; Time
              </th>
              <th className="w-[100px] text-[#75716B] font-bold uppercase text-[11px] tracking-wider px-5 py-3 whitespace-nowrap">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE8DA]">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[#75716B]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-[#1E1E1E]" />
                    <span className="text-xs font-semibold">Loading recent booking requests…</span>
                  </div>
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[#A39E95] text-xs">
                  No recent booking requests found.
                </td>
              </tr>
            ) : (
              bookings.map((booking) => (
                <tr
                  key={booking.id}
                  className="hover:bg-[#FAF6ED]/70 transition-colors"
                >
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="font-bold text-[#1E1E1E] bg-[#FAF6ED] border border-[#E8E1D5] px-2 py-0.5 rounded-lg text-xs">
                      {booking.id}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-[#1E1E1E]">
                    <span className="block max-w-[240px] truncate" title={booking.title}>
                      {booking.title}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#75716B] font-medium whitespace-nowrap">
                    {booking.requestedBy}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-[#1E1E1E] whitespace-nowrap">
                    {booking.venue}
                  </td>
                  <td className="px-5 py-3.5 text-[#75716B] whitespace-nowrap text-xs font-medium">
                    {formatDateTime(booking.date, booking.timeSlot)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                        statusClasses[booking.status as keyof typeof statusClasses] ??
                        statusClasses.pending
                      }`}
                    >
                      {booking.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}