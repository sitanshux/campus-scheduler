import { CalendarPlus, Plus, AlertTriangle, FileText } from 'lucide-react';

const actions = [
  {
    label: 'Book Venue',
    icon: CalendarPlus,
    className: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  },
  {
    label: 'Add Session',
    icon: Plus,
    className: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  {
    label: 'View Conflicts',
    icon: AlertTriangle,
    className: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  {
    label: 'Generate Report',
    icon: FileText,
    className: 'bg-slate-600 hover:bg-slate-700 text-white',
  },
] as const;

export default function QuickActions() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${action.className}`}
            >
              <Icon className="w-4 h-4" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
