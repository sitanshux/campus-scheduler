import { Compass, ArrowLeft, Home, LayoutDashboard } from 'lucide-react';
import type { AuthUser } from '../services/auth';

interface NotFoundPageProps {
  onNavigate: (route: string) => void;
  currentUser: AuthUser | null;
}

export default function NotFoundPage({ onNavigate, currentUser }: NotFoundPageProps) {
  const getRoleHome = () => {
    if (!currentUser) return '/';
    switch (currentUser.role) {
      case 'department_coordinator':
        return '/coordinator-overview';
      case 'faculty':
        return '/faculty-overview';
      case 'club':
        return '/club-overview';
      case 'admin':
      default:
        return '/dashboard';
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F3E7] text-[#1E1E1E] flex flex-col items-center justify-center p-4 antialiased">
      <div className="max-w-md w-full rounded-[28px] bg-[#FFFDF8] border border-[#E8E1D5] shadow-sm p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#151515] text-[#E9A8CE] mx-auto flex items-center justify-center shadow-xs">
          <Compass size={32} />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#75716B] bg-[#F4DA69]/30 px-3 py-1 rounded-full">
            HTTP 404 Error
          </span>
          <h1 className="text-3xl font-black text-[#1E1E1E] tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-[#75716B] leading-relaxed">
            The requested campus scheduler path does not exist or has been relocated.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-[#E8E1D5] bg-[#FFFDF8] hover:bg-[#FAF6ED] px-5 py-2.5 text-xs font-bold text-[#1E1E1E] shadow-2xs transition-colors cursor-pointer"
          >
            <Home size={14} />
            <span>Campus Home</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(getRoleHome())}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#151515] hover:bg-black text-white px-5 py-2.5 text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <LayoutDashboard size={14} className="text-[#E9A8CE]" />
            <span>{currentUser ? 'My Portal' : 'Sign In'}</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[#E8E1D5] flex items-center justify-center">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Go Back to Previous Page</span>
          </button>
        </div>
      </div>
    </div>
  );
}

