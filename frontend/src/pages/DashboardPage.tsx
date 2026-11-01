import { DoorOpen, Users, CalendarClock, Clock } from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import RecentBookings from '../components/dashboard/RecentBookings';
import QuickActions from '../components/dashboard/QuickActions';
import UpcomingExams from '../components/dashboard/UpcomingExams';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';
import { useApi } from '../hooks/useApi';
import { fetchDatasetSummary, fetchRecentBookings } from '../services/api';
import type { DashboardStats, DatasetSummaryResponse, BookingRequest } from '../types';

/** Map the backend summary response to the UI stat shape. */
function toStats(summary: DatasetSummaryResponse): DashboardStats {
  return {
    totalRooms: summary.counts.rooms,
    totalFaculty: summary.counts.faculty,
    activeSessions: summary.counts.sessions,
    pendingBookings: summary.counts.booking_requests,
  };
}

export default function DashboardPage() {
  const {
    data: summary,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useApi(fetchDatasetSummary);

  const {
    data: liveBookings,
    loading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useApi(fetchRecentBookings);

  const stats: DashboardStats | null = summary ? toStats(summary) : null;
  const bookings: BookingRequest[] = liveBookings ?? [];

  return (
    <div className="space-y-6">
      {/* Stats Error state */}
      {!statsLoading && statsError && (
        <ErrorAlert
          message={`Failed to load dashboard statistics: ${statsError}`}
          onRetry={refetchStats}
        />
      )}

      {/* Stats Grid */}
      {statsLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <LoadingSpinner message="Loading dashboard statistics from backend…" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Rooms"
            value={stats.totalRooms}
            icon={DoorOpen}
            trend={`${stats.totalRooms} venues registered`}
            color="indigo"
          />
          <StatCard
            title="Faculty Members"
            value={stats.totalFaculty}
            icon={Users}
            trend={`${stats.totalFaculty} registered faculty`}
            color="emerald"
          />
          <StatCard
            title="Active Sessions"
            value={stats.activeSessions}
            icon={CalendarClock}
            trend={`${stats.activeSessions} academic sessions`}
            color="amber"
          />
          <StatCard
            title="Pending Bookings"
            value={stats.pendingBookings}
            icon={Clock}
            trend={`${stats.pendingBookings} venue requests`}
            color="rose"
          />
        </div>
      ) : null}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Bookings — spans 2 columns */}
        <div className="lg:col-span-2">
          <RecentBookings
            bookings={bookings}
            loading={bookingsLoading}
            error={bookingsError}
            onRetry={refetchBookings}
          />
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <QuickActions />
          <UpcomingExams />
        </div>
      </div>
    </div>
  );
}
