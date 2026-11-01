import { Calendar, DoorOpen, Users, ClipboardList, ChevronRight } from 'lucide-react';

interface QuickActionsProps {
  onNavigate?: (page: string) => void;
}

export default function QuickActions({ onNavigate }: QuickActionsProps) {
  const actions = [
    {
      page: 'timetable',
      label: 'Weekly Schedule',
      desc: 'View & filter solver timetable',
      icon: Calendar,
      iconBg: 'bg-[#F4DA69]/30 text-[#6B530E]',
    },
    {
      page: 'rooms',
      label: 'Rooms & Venues',
      desc: 'Capacities & lab availability',
      icon: DoorOpen,
      iconBg: 'bg-[#B8CDEB]/35 text-[#1E3A5F]',
    },
    {
      page: 'faculty',
      label: 'Faculty Directory',
      desc: 'Teaching schedules & profiles',
      icon: Users,
      iconBg: 'bg-[#B9D9C2]/35 text-[#1B4D2E]',
    },
    {
      page: 'exams',
      label: 'Examinations',
      desc: '41 scheduled exam sessions',
      icon: ClipboardList,
      iconBg: 'bg-[#E9A8CE]/30 text-[#7D2956]',
    },
  ];

  return (
    <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs">
      <div className="mb-4">
        <h2 className="text-base sm:text-lg font-extrabold text-[#1E1E1E] tracking-tight">
          Admin Quick Actions
        </h2>
        <p className="text-xs text-[#75716B] mt-0.5 font-medium">
          Fast shortcuts to primary operational workspaces
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.page}
              type="button"
              onClick={() => onNavigate?.(action.page)}
              className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5] hover:bg-[#FAF6ED] hover:border-[#D5CDBD] transition-all cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-1.5 flex-1">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${action.iconBg}`}
                >
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#1E1E1E] leading-snug group-hover:text-black">
                    {action.label}
                  </p>
                  <p className="text-[11px] text-[#75716B] leading-tight font-medium mt-0.5">
                    {action.desc}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={14}
                className="text-[#A39E95] group-hover:text-[#1E1E1E] transition-colors shrink-0 ml-1"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}