import { useState } from 'react';
import { Search, Mail, Clock } from 'lucide-react';
import type { Faculty } from '../types';
import { fetchFaculty } from '../services/api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';

type FacultyStatus = 'Available' | 'On Leave' | 'Visiting';

const statusStyles: Record<FacultyStatus, string> = {
  Available: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  'On Leave': 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
  Visiting: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
};

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-sky-100 text-sky-700',
  'bg-purple-100 text-purple-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

function getInitials(name: string): string {
  const cleaned = name
    .replace(/^(dr\.|prof\.)\s*/i, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getEmail(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/^(dr\.|prof\.)\s*/i, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();
  const slug = cleaned.split(/\s+/).filter(Boolean).join('.');
  return `${slug || 'faculty'}@cit.edu`;
}

function getDisplayName(name: string): string {
  return name.replace(/\s*\(Visiting\)\s*/i, '').trim();
}

function getFacultyStatus(faculty: Faculty): { status: FacultyStatus; schedule?: string } {
  const isVisiting =
    faculty.name.includes('(Visiting)') ||
    faculty.unavailable.some((u) => u.reason.toLowerCase().includes('visiting'));

  if (isVisiting) {
    return { status: 'Visiting', schedule: 'Tue/Thu' };
  }

  if (faculty.name.includes('Meera Nair') || faculty.id === 'F05') {
    return { status: 'On Leave' };
  }

  return { status: 'Available' };
}

export default function FacultyPage() {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  const {
    data: liveFaculty,
    loading,
    error,
    refetch,
  } = useApi(fetchFaculty);

  const displayedFaculty: Faculty[] = liveFaculty ?? [];

  const filtered = displayedFaculty.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.department.toLowerCase().includes(search.toLowerCase());
    const matchesDept =
      deptFilter === 'All' ||
      f.department === deptFilter ||
      (deptFilter === 'EEE' && f.department === 'EE');
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Faculty Directory</h1>
          <p className="text-sm text-slate-500 mt-1">
            View and manage faculty members and their schedules
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="All">All Departments</option>
            <option value="CSE">CSE</option>
            <option value="ECE">ECE</option>
            <option value="EE">EE</option>
            <option value="ME">ME</option>
            <option value="CE">CE</option>
            <option value="MA">Mathematics (MA)</option>
            <option value="PH">Physics (PH)</option>
            <option value="HSS">HSS</option>
            <option value="ADMIN">Admin</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search faculty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {!loading && error && (
        <ErrorAlert
          message={error}
          onRetry={refetch}
        />
      )}

      {/* Loading state */}
      {loading ? (
        <LoadingSpinner message="Loading faculty directory..." />
      ) : !error ? (
        /* Faculty Table */
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Name
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Department
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Max Hours
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Status
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
              Action
            </span>
          </div>

          {/* Table Rows */}
          {filtered.map((faculty, index) => {
            const initials = getInitials(faculty.name);
            const email = getEmail(faculty.name);
            const displayName = getDisplayName(faculty.name);
            const { status, schedule } = getFacultyStatus(faculty);
            const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

            return (
              <div
                key={faculty.id}
                className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 sm:gap-4 items-center px-6 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors"
              >
                {/* Name & Avatar */}
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold shrink-0 ${avatarColor}`}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {displayName}
                      {status === 'Visiting' && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          (Visiting)
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Mail className="h-3 w-3 text-slate-400" />
                      <span className="text-xs text-slate-400">{email}</span>
                    </div>
                  </div>
                </div>

                {/* Department */}
                <div className="flex items-center gap-2 sm:block">
                  <span className="text-xs text-slate-400 sm:hidden">Dept:</span>
                  <span className="text-sm text-slate-600">{faculty.department}</span>
                </div>

                {/* Max Hours */}
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
                  <span className="text-xs text-slate-400 sm:hidden">Hours:</span>
                  <span className="text-sm text-slate-600">
                    {faculty.max_hours_per_day} hrs/day
                  </span>
                </div>

                {/* Status */}
                <div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
                  >
                    {status}
                    {schedule && ` (${schedule})`}
                  </span>
                </div>

                {/* Action */}
                <div className="text-right">
                  <button className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
                    View Schedule
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              No faculty members found matching your search.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
