import {
  LayoutDashboard,
  Calendar,
  DoorOpen,
  Users,
  ClipboardList,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Building2,
  ArrowRightLeft,
  CalendarPlus,
  Clock,
  Bot,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { PageId, UserRole } from '../../types';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  currentRole: UserRole;
}

interface NavItemConfig {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const navItemsByRole: Record<UserRole, NavItemConfig[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'timetable', label: 'Schedule', icon: Calendar },
    { id: 'rooms', label: 'Rooms & Venues', icon: DoorOpen },
    { id: 'faculty', label: 'Faculty Directory', icon: Users },
    { id: 'exams', label: 'Examinations', icon: ClipboardList },
    { id: 'bookings', label: 'Venue Bookings', icon: CalendarCheck },
  ],
  coordinator: [
    { id: 'coordinator-overview', label: 'Dept Overview', icon: Building2 },
    { id: 'coordinator-timetable', label: 'Dept Timetable', icon: Calendar },
    { id: 'coordinator-sessions', label: 'Session Proposals', icon: ArrowRightLeft },
    { id: 'coordinator-bookings', label: 'Dept Bookings', icon: CalendarPlus },
    { id: 'coordinator-approvals', label: 'Lab Approvals', icon: CalendarCheck },
  ],
  faculty: [
    { id: 'faculty-overview', label: 'My Overview', icon: User },
    { id: 'faculty-timetable', label: 'Personal Timetable', icon: Calendar },
    { id: 'faculty-unavailability', label: 'Unavailability', icon: Clock },
    { id: 'faculty-sessions', label: 'Session Requests', icon: ArrowRightLeft },
    { id: 'faculty-ai', label: 'AI Assistant', icon: Bot },
  ],
  club: [
    { id: 'club-overview', label: 'Club Overview', icon: LayoutDashboard },
    { id: 'club-submit', label: 'Submit Venue Request', icon: CalendarPlus },
    { id: 'club-requests', label: 'My Requests', icon: CalendarCheck },
  ],
};

const roleTitles: Record<UserRole, { badge: string; color: string; dot: string }> = {
  admin: { badge: 'Administrator', color: 'text-[#B9B5F4]', dot: 'bg-[#B9B5F4]' },
  coordinator: { badge: 'Dept Coordinator', color: 'text-[#B9B5F4]', dot: 'bg-[#B9B5F4]' },
  faculty: { badge: 'Faculty Member', color: 'text-[#B9D9C2]', dot: 'bg-[#B9D9C2]' },
  club: { badge: 'Club Representative', color: 'text-[#F4DA69]', dot: 'bg-[#F4DA69]' },
};

export default function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  currentRole,
}: SidebarProps) {
  const navItems = navItemsByRole[currentRole] ?? navItemsByRole.admin;
  const roleMeta = roleTitles[currentRole] ?? roleTitles.admin;

  return (
    <aside
      className={`relative flex flex-col bg-[#151515] text-white transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[74px] p-2.5' : 'w-[236px] p-4'
      } h-full rounded-[26px] shadow-[0_10px_35px_rgba(0,0,0,0.18)] select-none border border-white/[0.06]`}
    >
      {/* Circular pink collapse button - positioned cleanly on the sidebar edge (matches reference) */}
      <button
        onClick={onToggleCollapse}
        className="hidden lg:flex absolute -right-3 top-5 w-6 h-6 rounded-full bg-[#E9A8CE] text-[#151515] items-center justify-center hover:bg-[#F3C4DF] hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-md z-30 ring-2 ring-[#151515]"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight size={13} strokeWidth={2.8} />
        ) : (
          <ChevronLeft size={13} strokeWidth={2.8} />
        )}
      </button>

      {/* Wordmark Logo Header */}
      <div className="flex items-center justify-between px-2 pt-1 pb-4 border-b border-white/[0.08] min-h-[48px]">
        {!collapsed ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xl font-bold tracking-tight text-white lowercase font-sans select-none truncate">
              cit<span className="text-[#E9A8CE]">.</span>scheduler
            </span>
          </div>
        ) : (
          <div className="w-full flex justify-center items-center py-0.5">
            <span className="text-base font-black tracking-tight text-[#E9A8CE] select-none">
              cit<span className="text-white">.</span>
            </span>
          </div>
        )}

        {/* Mobile close button (visible only in mobile drawer mode) */}
        <button
          onClick={onToggleCollapse}
          className="lg:hidden w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer shrink-0 ml-auto"
          aria-label="Close menu drawer"
          title="Close menu drawer"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Navigation section header */}
      {!collapsed && (
        <div className="px-3 pt-4 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B72]">
            General
          </p>
        </div>
      )}

      {/* Primary Navigation List */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-1 py-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`group relative flex w-full items-center rounded-2xl py-2.5 text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                collapsed ? 'justify-center px-2' : 'gap-3 px-3'
              } ${
                isActive
                  ? 'bg-white/[0.09] text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-[#E9A8CE]'
                  : 'text-[#96928A] hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Icon
                size={18}
                className={`shrink-0 transition-colors ${
                  isActive ? 'text-[#E9A8CE]' : 'text-[#8E8A82] group-hover:text-white'
                }`}
              />
              {!collapsed && (
                <span className="whitespace-nowrap text-xs truncate">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Secondary Workspace / Footer Tools Section */}
      <div className="pt-2 border-t border-white/[0.08] px-1 space-y-2">
        {!collapsed && (
          <div className="px-2 pt-1 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B72]">
              Workspace Scope
            </p>
          </div>
        )}

        <div
          className={`flex items-center rounded-2xl bg-white/[0.04] border border-white/[0.06] p-2.5 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${roleMeta.dot}`} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white leading-tight truncate">
                  {roleMeta.badge}
                </p>
                <p className="text-[10px] text-[#78746D] leading-tight">
                  Role Preview
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <span className="text-[10px] font-semibold text-[#E9A8CE] bg-[#E9A8CE]/15 px-2 py-0.5 rounded-full border border-[#E9A8CE]/20">
              Active
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
