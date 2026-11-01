import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  color?:
    | 'indigo'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'pink'
    | 'yellow'
    | 'lavender'
    | 'blue'
    | 'green';
}

const colorMap: Record<string, string> = {
  indigo: 'bg-[#B8CDEB]/35 text-[#24426E]',
  emerald: 'bg-[#B9D9C2]/45 text-[#1F5433]',
  amber: 'bg-[#F4DA69]/40 text-[#6B530E]',
  rose: 'bg-[#E9A8CE]/35 text-[#732450]',
  pink: 'bg-[#E9A8CE]/35 text-[#732450]',
  yellow: 'bg-[#F4DA69]/40 text-[#6B530E]',
  lavender: 'bg-[#B9B5F4]/35 text-[#353177]',
  blue: 'bg-[#B8CDEB]/35 text-[#24426E]',
  green: 'bg-[#B9D9C2]/45 text-[#1F5433]',
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'indigo',
}: StatCardProps) {
  const iconTheme = colorMap[color] ?? colorMap.indigo;

  return (
    <div className="bg-[#FFFDF8] rounded-[22px] border border-[#E8E1D5] p-5 shadow-[0_2px_12px_rgba(30,30,30,0.02)] hover:border-[#D8CFBF] transition-all flex justify-between items-start">
      <div className="min-w-0 pr-3">
        <p className="text-xs font-semibold text-[#75716B] tracking-wide uppercase">
          {title}
        </p>
        <p className="text-3xl font-extrabold text-[#1E1E1E] mt-1.5 tracking-tight">
          {value}
        </p>
        {trend && (
          <p className="text-xs text-[#8C877E] mt-1.5 font-medium truncate">
            {trend}
          </p>
        )}
      </div>
      <div
        className={`w-11 h-11 rounded-[16px] flex items-center justify-center shrink-0 ${iconTheme}`}
      >
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}
