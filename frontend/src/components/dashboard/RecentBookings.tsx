import { Loader2 } from 'lucide-react';
import type { BookingRequest } from '../../types';

interface RecentBookingsProps {
  bookings: BookingRequest[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const statusClasses = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
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
  return `${formatted}, ${timeSlot}`;
}

export default function RecentBookings({
  bookings,
  loading = false,
  error = null,
  onRetry,
}: RecentBookingsProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Recent Booking Requests</h2>
        <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          View All
        </button>
      </div>

      {error && (
        <div className="px-6 py-3 border-b border-rose-100 bg-rose-50/70 flex items-center justify-between gap-3 text-xs text-rose-700">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium shrink-0">Error loading bookings:</span>
            <span className="truncate">{error}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline underline-offset-2 shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-slate-500 font-medium text-left uppercase text-xs tracking-wider px-6 py-3">
                Request ID
              </th>
              <th className="text-slate-500 font-medium text-left uppercase text-xs tracking-wider px-6 py-3">
                Event Title
              </th>
              <th className="text-slate-500 font-medium text-left uppercase text-xs tracking-wider px-6 py-3">
                Requested By
              </th>
              <th className="text-slate-500 font-medium text-left uppercase text-xs tracking-wider px-6 py-3">
                Venue
              </th>
              <th className="text-slate-500 font-medium text-left uppercase text-xs tracking-wider px-6 py-3">
                Date &amp; Time
              </th>
              <th className="text-slate-500 font-medium text-left uppercase text-xs tracking-wider px-6 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    <span className="text-sm">Loading recent booking requests…</span>
                  </div>
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  No recent booking requests.
                </td>
              </tr>
            ) : (
              bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                    {booking.id}
                  </td>
                  <td className="px-6 py-3 text-slate-900 font-medium">
                    <span className="block max-w-[200px] truncate">{booking.title}</span>
                  </td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                    {booking.requestedBy}
                  </td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                    {booking.venue}
                  </td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                    {formatDateTime(booking.date, booking.timeSlot)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusClasses[booking.status as keyof typeof statusClasses] ?? statusClasses.pending}`}
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
