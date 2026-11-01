import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  color: 'indigo' | 'emerald' | 'amber' | 'rose';
}

const colorMap = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
} as const;

export default function StatCard({ title, value, icon: Icon, trend, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex justify-between items-start">
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
        {trend && <p className="text-xs text-slate-400 mt-1">{trend}</p>}
      </div>
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${colorMap[color]}`}
      >
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );
}
