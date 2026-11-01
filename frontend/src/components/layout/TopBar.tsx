import { Bell, Menu, LogOut, Home } from 'lucide-react';
import type { Faculty, UserRole } from '../../types';
import type { AuthUser } from '../../services/auth';
import GlobalSearch from './GlobalSearch';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuToggle: () => void;
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeFaculty?: Faculty;
  activeCoordinatorDept?: string;
  onNavigate?: (page: string) => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

function getFacultyInitials(name: string): string {
  // Strip parenthetical notes like (Visiting) and title prefixes like Dr., Prof.
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

const roleProfiles: Record<
  UserRole,
  { label: string; sub: string; initials: string; bg: string }
> = {
  admin: {
    label: 'Admin Panel',
    sub: 'Super Administrator',
    initials: 'AP',
    bg: 'bg-[#1E1E1E]',
  },
  coordinator: {
    label: 'Dr. Ananya Mishra',
    sub: 'Dept Coordinator (CSE)',
    initials: 'AM',
    bg: 'bg-[#1E1E1E]',
  },
  faculty: {
    label: 'Faculty Member',
    sub: 'Faculty Portal',
    initials: 'FM',
    bg: 'bg-[#1E1E1E]',
  },
  club: {
    label: 'Coding Club Lead',
    sub: 'Club Representative',
    initials: 'CC',
    bg: 'bg-[#1E1E1E]',
  },
};

export default function TopBar({
  title,
  subtitle,
  onMenuToggle,
  currentRole,
  onRoleChange,
  activeFaculty,
  activeCoordinatorDept,
  onNavigate,
  currentUser,
  onLogout,
}: TopBarProps) {
  let profile = roleProfiles[currentRole] ?? roleProfiles.admin;

  if (currentRole === 'coordinator') {
    const isCrossDept = Boolean(
      activeCoordinatorDept && activeCoordinatorDept !== 'CSE'
    );
    profile = {
      label: 'Dr. Ananya Mishra',
      sub: isCrossDept
        ? `Dept Coordinator (CSE) • Viewing ${activeCoordinatorDept}`
        : 'Dept Coordinator (CSE)',
      initials: 'AM',
      bg: 'bg-[#1E1E1E]',
    };
  } else if (currentRole === 'faculty' && activeFaculty) {
    profile = {
      label: activeFaculty.name,
      sub: `Faculty (${activeFaculty.department} Dept)`,
      initials: getFacultyInitials(activeFaculty.name),
      bg: 'bg-[#1E1E1E]',
    };
  }

  // Override profile with authenticated user info when available
  if (currentUser) {
    profile = {
      ...profile,
      label: currentUser.full_name,
      sub: currentUser.email,
      initials: getFacultyInitials(currentUser.full_name),
    };
  }

  return (
    <header className="flex flex-col gap-2.5 pb-2 shrink-0 px-1">
      {/* Top Utility Bar: Mobile menu + Search pill + Dev Preview + Notifications + Avatar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Mobile Menu + Search Pill */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
          <button
            onClick={onMenuToggle}
            className="rounded-2xl p-2.5 text-[#1E1E1E] bg-[#FFFDF8] border border-[#E8E1D5] transition-colors hover:bg-[#F3EDE0] lg:hidden cursor-pointer shadow-2xs"
            aria-label="Toggle navigation menu"
          >
            <Menu size={18} />
          </button>

          {/* Functional Intelly-Style Global Search Pill & Dropdown */}
          <GlobalSearch
            currentRole={currentRole}
            onNavigate={onNavigate ?? (() => {})}
          />
        </div>

        {/* Right: Dev Role Switcher + Notification Bell + Profile */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Campus Home Button */}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="w-9 h-9 rounded-full bg-[#FFFDF8] border border-[#E8E1D5] text-[#1E1E1E] flex items-center justify-center hover:bg-[#FAF6ED] transition-colors cursor-pointer shadow-2xs shrink-0"
              title="Public Campus Landing Page"
              aria-label="Public Campus Landing Page"
            >
              <Home size={15} />
            </button>
          )}

          {/* Dev Role Preview Switcher */}
          <div className="flex items-center gap-1.5 bg-[#FFFDF8] border border-[#E8E1D5] rounded-full py-1 px-2.5 shadow-2xs">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#6B530E] bg-[#F4DA69]/35 border border-[#F4DA69]/50 rounded-full px-2 py-0.5">
              ⚡ Dev Preview
            </span>
            <label
              htmlFor="dev-role-select"
              className="text-xs text-[#75716B] font-medium hidden sm:inline"
            >
              Role:
            </label>
            <select
              id="dev-role-select"
              value={currentRole}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              className="text-xs font-bold text-[#1E1E1E] bg-transparent focus:outline-none cursor-pointer pr-1"
              title="Temporary development-only role preview mechanism to inspect role dashboards. Not real authentication."
            >
              <option value="admin">Administrator</option>
              <option value="coordinator">Dept Coordinator</option>
              <option value="faculty">Faculty Member</option>
              <option value="club">Club Representative</option>
            </select>
          </div>

          {/* Notification Button */}
          <button
            className="w-9 h-9 rounded-full bg-[#1E1E1E] text-white flex items-center justify-center relative hover:bg-black transition-colors cursor-pointer shadow-xs shrink-0"
            aria-label="Notifications"
          >
            <Bell size={15} />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#E9A8CE] ring-2 ring-[#1E1E1E]" />
          </button>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5 pl-1">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0 border border-[#E8E1D5] ${profile.bg}`}
            >
              {profile.initials}
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-bold text-[#1E1E1E] leading-tight">
                {profile.label}
              </p>
              <p className="text-[11px] text-[#75716B] leading-tight">{profile.sub}</p>
            </div>
          </div>

          {/* Sign Out Button */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFFDF8] border border-[#E8E1D5] hover:bg-[#FDF2F4] hover:border-[#F5C2C7] hover:text-[#DC3545] text-xs font-bold text-[#75716B] transition-colors cursor-pointer shadow-2xs shrink-0 ml-0.5"
              title="Sign out from current session"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          )}
        </div>
      </div>

      {/* Page Heading Row: Intelly Editorial Heading */}
      <div className="pt-2 px-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E1E1E] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[#75716B] mt-0.5 font-medium">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
