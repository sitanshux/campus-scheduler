import { Bell, Menu } from 'lucide-react';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuToggle: () => void;
}

export default function TopBar({ title, subtitle, onMenuToggle }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* Left: Mobile menu + Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: Notifications + Profile */}
      <div className="flex items-center gap-5">
        {/* Notification Bell */}
        <button
          className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            AP
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-slate-900">Admin Panel</p>
            <p className="text-xs text-slate-500">Super Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
