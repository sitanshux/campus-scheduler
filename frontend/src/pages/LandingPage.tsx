import {
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  ArrowRightLeft,
  Users,
  GraduationCap,
  ChevronRight,
  Award,
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (route: string) => void;
  isAuthenticated?: boolean;
}

export default function LandingPage({ onNavigate, isAuthenticated = false }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#F8F3E7] text-[#1E1E1E] antialiased selection:bg-[#E9A8CE]/30 selection:text-[#1E1E1E]">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 bg-[#FAF6ED]/90 backdrop-blur-md border-b border-[#E8E1D5] px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Brand */}
          <div
            onClick={() => onNavigate('/')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl bg-[#151515] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Calendar className="h-5 w-5 text-[#E9A8CE]" />
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-[#1E1E1E] block leading-tight">
                CIT Campus Scheduler
              </span>
              <span className="text-[10px] uppercase font-bold text-[#75716B] tracking-wider block">
                Chennai Institute of Technology
              </span>
            </div>
          </div>

          {/* Nav Links & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="#features"
              className="hidden md:inline-flex px-3.5 py-1.5 text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="hidden md:inline-flex px-3.5 py-1.5 text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] transition-colors"
            >
              How It Works
            </a>
            <a
              href="#roles"
              className="hidden md:inline-flex px-3.5 py-1.5 text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] transition-colors"
            >
              Roles
            </a>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="inline-flex items-center gap-2 rounded-full bg-[#151515] hover:bg-[#333] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
              >
                <span>Go to Dashboard</span>
                <ArrowRight size={13} className="text-[#E9A8CE]" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="rounded-full border border-[#E8E1D5] bg-[#FFFDF8] hover:bg-[#FAF6ED] px-4 py-2 text-xs font-bold text-[#1E1E1E] shadow-2xs transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] hover:bg-[#333] px-4.5 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                >
                  <span>Get Started</span>
                  <ChevronRight size={14} className="text-[#E9A8CE]" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="px-4 sm:px-8 pt-12 sm:pt-20 pb-16 max-w-7xl mx-auto">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FFFDF8] border border-[#E8E1D5] px-4 py-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#1B4D2E] animate-pulse" />
            <span className="text-xs font-bold text-[#1E1E1E]">
              Google OR-Tools CP-SAT &amp; Gemini AI Driven
            </span>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#F4DA69]/30 text-[#6B530E]">
              Hackathon Round 2
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#1E1E1E] tracking-tight leading-[1.1]">
            Intelligent Campus Scheduling &amp; Venue Management
          </h1>

          {/* Problem Statement & Solution */}
          <p className="text-sm sm:text-base text-[#75716B] font-medium leading-relaxed max-w-2xl">
            Manual academic timetabling causes catastrophic room clashes, lab capacity bottlenecks, and faculty overbooking. 
            CIT Campus Scheduler deterministically solves <strong>228+ weekly sessions</strong> with zero overlaps in seconds, 
            combining mathematical constraint satisfaction with generative AI for natural-language venue reservations and disruption recovery.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="inline-flex items-center gap-2 rounded-full bg-[#151515] hover:bg-black text-white px-7 py-3 text-xs sm:text-sm font-extrabold shadow-md hover:scale-[1.02] transition-all cursor-pointer"
            >
              <span>Access Campus Portal</span>
              <ArrowRight size={15} className="text-[#E9A8CE]" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="rounded-full border border-[#E8E1D5] bg-[#FFFDF8] hover:bg-[#FAF6ED] px-6 py-3 text-xs sm:text-sm font-bold text-[#1E1E1E] shadow-2xs transition-all cursor-pointer"
            >
              Demo Accounts &amp; Sign In
            </button>
          </div>

          {/* Live Proof Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-8 w-full max-w-3xl">
            <div className="p-4 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] shadow-2xs text-left">
              <div className="text-2xl font-black text-[#1E1E1E]">228/228</div>
              <div className="text-[11px] font-bold text-[#75716B] mt-0.5">Sessions Scheduled</div>
              <div className="text-[10px] text-[#1B4D2E] font-semibold mt-1">100% Zero-Clash</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] shadow-2xs text-left">
              <div className="text-2xl font-black text-[#1E1E1E]">24</div>
              <div className="text-[11px] font-bold text-[#75716B] mt-0.5">Campus Venues</div>
              <div className="text-[10px] text-[#1E4378] font-semibold mt-1">Labs, Halls &amp; Classes</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] shadow-2xs text-left">
              <div className="text-2xl font-black text-[#1E1E1E]">&lt; 1.5s</div>
              <div className="text-[11px] font-bold text-[#75716B] mt-0.5">CP-SAT Solve Time</div>
              <div className="text-[10px] text-[#6B530E] font-semibold mt-1">Optimal Perturbation</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] shadow-2xs text-left">
              <div className="text-2xl font-black text-[#1E1E1E]">4 Roles</div>
              <div className="text-[11px] font-bold text-[#75716B] mt-0.5">RBAC Security</div>
              <div className="text-[10px] text-[#7A1F52] font-semibold mt-1">Anti-Self-Approval</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Sections ── */}
      <section id="features" className="px-4 sm:px-8 py-16 bg-[#FFFDF8] border-y border-[#E8E1D5]">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#E9A8CE] bg-[#151515] px-3 py-1 rounded-full">
              Six Core Architectural Capabilities
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#1E1E1E] tracking-tight">
              Built on Proven Mathematical Solvers and GenAI
            </h2>
            <p className="text-xs sm:text-sm text-[#75716B] font-medium">
              Every feature is backed by real running backend endpoints, tested constraint models, and Supabase RLS security.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. Automated Timetable */}
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED] transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-center justify-center text-[#1E1E1E]">
                <Calendar className="h-5 w-5 text-[#1B4D2E]" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Automated Clash-Free Timetables
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Google OR-Tools CP-SAT solver evaluates faculty availability, daily workload caps (max 4h), student cohort boundaries, and specialized room types without creating scheduling conflicts.
              </p>
            </div>

            {/* 2. AI Venue Booking */}
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED] transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-center justify-center text-[#1E1E1E]">
                <Sparkles className="h-5 w-5 text-[#E9A8CE]" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                AI-Powered Venue Booking
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Club representatives describe events in natural English or Hinglish. Google Gemini extracts date, attendance, facility needs, and validates against the CP-SAT booking solver before submission.
              </p>
            </div>

            {/* 3. Faculty Rescheduling */}
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED] transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-center justify-center text-[#1E1E1E]">
                <ArrowRightLeft className="h-5 w-5 text-[#1E4378]" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Faculty Rescheduling Assistant
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                When unexpected leaves occur, the disruption solver calculates the minimal perturbation required—freezing 140+ sessions and reallocating only necessary classes with before/after visual diffs.
              </p>
            </div>

            {/* 4. Exam Timetable */}
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED] transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-center justify-center text-[#1E1E1E]">
                <GraduationCap className="h-5 w-5 text-[#6B530E]" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Examination Management
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Automated midsem and endsem scheduling with strict 50% half-capacity seating, multi-room allocation, 3-hour morning/afternoon blocks, and cohort-specific CSV export.
              </p>
            </div>

            {/* 5. Room Utilisation */}
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED] transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-center justify-center text-[#1E1E1E]">
                <Building2 className="h-5 w-5 text-[#7A1F52]" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Room Utilisation &amp; Analytics
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Real-time tracking of 24 facilities. Analyze peak load across computer laboratories (82%), lecture halls (85%), and classrooms (72%) with period-by-period venue schedules.
              </p>
            </div>

            {/* 6. Role-Based Management */}
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED] transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-center justify-center text-[#1E1E1E]">
                <ShieldCheck className="h-5 w-5 text-[#1B4D2E]" />
              </div>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Role-Based Governance (RBAC)
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Authoritative Supabase database policies prevent privilege escalation. Strict anti-self-approval rules guarantee that requesters cannot approve their own booking or rescheduling requests.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works Section ── */}
      <section id="how-it-works" className="px-4 sm:px-8 py-16 max-w-7xl mx-auto">
        <div className="space-y-12">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#75716B]">
              Engine Architecture
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#1E1E1E]">
              How CIT Scheduler Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-[#151515] text-white font-black text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Constraint Ingestion
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                The system loads the official CIT dataset: 24 venues, 28 faculty members with registered unavailability, 8 student cohorts, and course catalog credit hours.
              </p>
            </div>

            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-[#151515] text-white font-black text-xs flex items-center justify-center">
                2
              </span>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                CP-SAT Constraint Solving
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Google OR-Tools CP-SAT executes branch-and-bound optimization with multi-threading, maximizing curriculum continuity while keeping soft penalties minimal.
              </p>
            </div>

            <div className="p-6 rounded-[24px] border border-[#E8E1D5] bg-[#FFFDF8] space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-[#151515] text-white font-black text-xs flex items-center justify-center">
                3
              </span>
              <h3 className="text-base font-extrabold text-[#1E1E1E]">
                Live Dynamic Operations
              </h3>
              <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                Coordinators review lab bookings, clubs reserve facilities through AI validation, and administrators approve schedule changes with persistent audit logging.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Four User Roles Section ── */}
      <section id="roles" className="px-4 sm:px-8 py-16 bg-[#FFFDF8] border-t border-[#E8E1D5]">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#75716B]">
              Role Experiences
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#1E1E1E]">
              Designed for Campus Stakeholders
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Admin */}
            <div className="p-5 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] text-white px-2.5 py-0.5 text-[10px] font-extrabold">
                  <ShieldCheck size={11} className="text-[#E9A8CE]" />
                  <span>Administrator</span>
                </span>
                <h4 className="font-extrabold text-[#1E1E1E] text-sm">
                  Executive Operations
                </h4>
                <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                  Controls timetable generation runs, reviews faculty rescheduling proposals, and monitors room utilization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="text-xs font-bold text-[#1E1E1E] hover:underline flex items-center gap-1"
              >
                <span>Login as Admin</span>
                <ArrowRight size={11} />
              </button>
            </div>

            {/* Coordinator */}
            <div className="p-5 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 text-[10px] font-extrabold text-[#1E1E1E]">
                  <Building2 size={11} className="text-[#1E4378]" />
                  <span>Coordinator</span>
                </span>
                <h4 className="font-extrabold text-[#1E1E1E] text-sm">
                  Department Timetable
                </h4>
                <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                  Oversees department classes, reviews session moves, and evaluates laboratory facility utilization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="text-xs font-bold text-[#1E1E1E] hover:underline flex items-center gap-1"
              >
                <span>Login as Coordinator</span>
                <ArrowRight size={11} />
              </button>
            </div>

            {/* Faculty */}
            <div className="p-5 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 text-[10px] font-extrabold text-[#1E1E1E]">
                  <Users size={11} className="text-[#6B530E]" />
                  <span>Faculty</span>
                </span>
                <h4 className="font-extrabold text-[#1E1E1E] text-sm">
                  Personal Portal
                </h4>
                <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                  Personal weekly calendar, records unavailable slots, and requests remedial sessions with Gemini AI assistant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="text-xs font-bold text-[#1E1E1E] hover:underline flex items-center gap-1"
              >
                <span>Login as Faculty</span>
                <ArrowRight size={11} />
              </button>
            </div>

            {/* Club */}
            <div className="p-5 rounded-[22px] border border-[#E8E1D5] bg-[#FAF6ED]/40 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 text-[10px] font-extrabold text-[#1E1E1E]">
                  <Award size={11} className="text-[#7A1F52]" />
                  <span>Club Lead</span>
                </span>
                <h4 className="font-extrabold text-[#1E1E1E] text-sm">
                  Events &amp; Venues
                </h4>
                <p className="text-xs text-[#75716B] font-medium leading-relaxed">
                  Generates venue requests via natural language, inspects solver conflict validations, and tracks decisions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="text-xs font-bold text-[#1E1E1E] hover:underline flex items-center gap-1"
              >
                <span>Login as Club</span>
                <ArrowRight size={11} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#151515] text-[#FAF6ED] px-4 sm:px-8 py-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#E9A8CE]" />
              <span className="font-extrabold text-white text-base">
                CIT Campus Scheduler
              </span>
            </div>
            <p className="text-xs text-white/60 mt-1 max-w-sm font-medium">
              Automated Campus Timetabling &amp; Venue Management System. Developed for Web Hackathon Round 2.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="rounded-full bg-white text-[#151515] hover:bg-[#FAF6ED] px-5 py-2 text-xs font-extrabold transition-colors cursor-pointer"
            >
              Sign In to Portal
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-white/50">
          <span>&copy; 2027 Chennai Institute of Technology. All rights reserved.</span>
          <span>Engine: Google OR-Tools CP-SAT • AI: Gemini 2.5 • Auth: Supabase &amp; PostgreSQL</span>
        </div>
      </footer>
    </div>
  );
}
