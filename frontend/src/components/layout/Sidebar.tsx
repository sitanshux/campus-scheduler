import {
  LayoutDashboard,
  Calendar,
  DoorOpen,
  Users,
  ClipboardList,
  CalendarCheck,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'rooms', label: 'Rooms', icon: DoorOpen },
  { id: 'faculty', label: 'Faculty', icon: Users },
  { id: 'exams', label: 'Exams', icon: ClipboardList },
  { id: 'bookings', label: 'Venue Bookings', icon: CalendarCheck },
];

export default function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={`flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-64'
      } h-full`}
    >
      {/* Logo / Branding */}
      <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-5">
        <GraduationCap className="shrink-0 text-indigo-400" size={28} />
        {!collapsed && (
          <span className="whitespace-nowrap text-lg font-bold tracking-tight">
            CIT Scheduler
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && (
                <span className="whitespace-nowrap">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-slate-700 p-4">
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
    </aside>
  );
}
