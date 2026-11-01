import { useState } from 'react';
import { Search, MapPin, Users, Monitor, Wifi, Wind, Accessibility } from 'lucide-react';
import type { Room } from '../types';
import { fetchRooms } from '../services/api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';

type RoomStatus = 'Available' | 'Occupied' | 'Under Maintenance';

const statusStyles: Record<RoomStatus, string> = {
  Available: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  Occupied: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  'Under Maintenance': 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
};

const filterOptions = ['All', 'Lecture Halls', 'Labs', 'Seminar Halls'] as const;

const FEATURE_LABELS: Record<string, string> = {
  projector: 'Projector',
  ac: 'AC',
  pa_system: 'Sound System',
  stage: 'Stage',
  computers: 'Computers',
  power_benches: 'Power Benches',
  wifi: 'Wi-Fi',
  'wi-fi': 'Wi-Fi',
  'sound system': 'Sound System',
  'video conferencing': 'Video Conferencing',
  'lab equipment': 'Lab Equipment',
};

function formatFeature(feature: string): string {
  const lower = feature.toLowerCase().trim();
  if (FEATURE_LABELS[lower]) {
    return FEATURE_LABELS[lower];
  }
  return feature
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getFeatureIcon(feature: string) {
  const lower = feature.toLowerCase();
  if (lower === 'wi-fi' || lower === 'wifi') {
    return <Wifi className="h-3 w-3" />;
  }
  if (lower === 'ac') {
    return <Wind className="h-3 w-3" />;
  }
  if (
    lower === 'projector' ||
    lower === 'computers' ||
    lower === 'video conferencing'
  ) {
    return <Monitor className="h-3 w-3" />;
  }
  return null;
}

function getRoomStatus(room: Room): RoomStatus {
  if ((room as { status?: RoomStatus }).status) {
    return (room as { status?: RoomStatus }).status!;
  }
  // Rooms with active maintenance entries in CIT dataset
  if (room.id === 'LH-4' || room.id === 'CR-103') {
    return 'Under Maintenance';
  }
  return 'Available';
}

export default function RoomsPage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');

  const {
    data: liveRooms,
    loading,
    error,
    refetch,
  } = useApi(fetchRooms);

  const displayedRooms: Room[] = liveRooms ?? [];

  const filteredRooms = displayedRooms.filter((room) => {
    const matchesSearch =
      room.name.toLowerCase().includes(search.toLowerCase()) ||
      room.building.toLowerCase().includes(search.toLowerCase());

    let matchesFilter = true;
    if (activeFilter === 'Lecture Halls') {
      matchesFilter = room.type === 'lecture_hall' || room.type === 'auditorium';
    } else if (activeFilter === 'Labs') {
      matchesFilter =
        room.type === 'lab_cs' ||
        room.type === 'lab_elec' ||
        room.type === 'lab_phy' ||
        room.type === 'lab_civil' ||
        room.type === 'workshop';
    } else if (activeFilter === 'Seminar Halls') {
      matchesFilter = room.type === 'seminar_hall';
    }

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rooms & Venues</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage campus rooms, labs, and auditoriums
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search rooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterOptions.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === filter
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Error state */}
      {!loading && error && (
        <ErrorAlert
          message={error}
          onRetry={refetch}
        />
      )}

      {/* Loading state */}
      {loading ? (
        <LoadingSpinner message="Loading campus rooms & venues..." />
      ) : !error ? (
        /* Room Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRooms.map((room) => {
            const status = getRoomStatus(room);

            return (
              <div
                key={room.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Top Row: Name & Status */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{room.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm text-slate-500">{room.building}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyles[status]}`}
                  >
                    {status}
                  </span>
                </div>

                {/* Capacity */}
                <div className="mt-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-600">{room.capacity} seats</span>
                  {room.accessible && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <Accessibility className="h-3.5 w-3.5" />
                      Accessible
                    </span>
                  )}
                </div>

                {/* Features */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {room.features.map((feature) => (
                    <span
                      key={feature}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {getFeatureIcon(feature)}
                      {formatFeature(feature)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Empty State */}
      {!loading && !error && filteredRooms.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            No rooms or venues found matching your criteria.
          </p>
        </div>
      )}
    </div>
  );
}
