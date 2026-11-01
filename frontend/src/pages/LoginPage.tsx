import { useState, type FormEvent } from 'react';
import {
  Calendar,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Building2,
  Users,
  Award,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  loginWithCredentials,
  DEMO_ACCOUNTS,
  type AuthUser,
  type DemoAccount,
} from '../services/auth';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
  onNavigateHome: () => void;
  redirectNotice?: string | null;
}

export default function LoginPage({
  onLoginSuccess,
  onNavigateHome,
  redirectNotice = null,
}: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDemoRole, setSelectedDemoRole] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your institutional email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const user = await loginWithCredentials(email, password);
      onLoginSuccess(user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDemo = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword('demoPass123!');
    setSelectedDemoRole(account.role);
    setError(null);
  };

  const handleQuickLogin = async (account: DemoAccount) => {
    setEmail(account.email);
    setPassword('demoPass123!');
    setSelectedDemoRole(account.role);
    setError(null);
    setLoading(true);

    try {
      const user = await loginWithCredentials(account.email, 'demoPass123!');
      onLoginSuccess(user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Quick login failed. Please try manual entry.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <ShieldCheck size={16} className="text-[#E9A8CE]" />;
      case 'department_coordinator':
        return <Building2 size={16} className="text-[#1E4378]" />;
      case 'faculty':
        return <Users size={16} className="text-[#6B530E]" />;
      case 'club':
        return <Award size={16} className="text-[#7A1F52]" />;
      default:
        return <Sparkles size={16} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F3E7] text-[#1E1E1E] flex flex-col justify-between p-4 sm:p-6 lg:p-8 antialiased selection:bg-[#E9A8CE]/30">
      {/* Top Header */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between pb-6">
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-2xl bg-[#151515] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <Calendar className="h-4.5 w-4.5 text-[#E9A8CE]" />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-[#1E1E1E] block leading-tight">
              cit<span className="text-[#E9A8CE]">.</span>scheduler
            </span>
            <span className="text-[10px] uppercase font-bold text-[#75716B] tracking-wider block">
              Chennai Institute of Technology
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={onNavigateHome}
          className="text-xs font-bold text-[#75716B] hover:text-[#1E1E1E] transition-colors"
        >
          &larr; Back to Public Overview
        </button>
      </div>

      {/* Main Login Card Container */}
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start my-auto">
        {/* Left Column: Form (7 cols) */}
        <div className="lg:col-span-7 bg-[#FFFDF8] border border-[#E8E1D5] rounded-[28px] p-6 sm:p-8 shadow-sm">
          <div className="space-y-1.5 mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#151515] text-white px-3 py-1 text-[10px] font-black uppercase tracking-wider">
              <Sparkles size={11} className="text-[#E9A8CE]" />
              <span>Campus Authentication</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#1E1E1E] tracking-tight">
              Sign In to Your Workspace
            </h1>
            <p className="text-xs sm:text-sm text-[#75716B] font-medium">
              Enter your credentials to access your role-specific dashboard and schedules.
            </p>
          </div>

          {/* Optional Redirect notice banner */}
          {redirectNotice && (
            <div className="mb-5 p-3 rounded-2xl bg-[#FAF6ED] border border-[#E8E1D5] flex items-start gap-2.5 text-xs text-[#75716B] font-medium">
              <AlertCircle size={16} className="text-[#6B530E] shrink-0 mt-0.5" />
              <span>{redirectNotice}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-[#FDF2F4] border border-[#F5C2C7] flex items-start gap-2.5 text-xs text-[#842029] font-medium">
              <AlertCircle size={16} className="text-[#DC3545] shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="block text-xs font-bold text-[#1E1E1E] uppercase tracking-wider"
              >
                Institutional Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#75716B]">
                  <Mail size={16} />
                </div>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. faculty@test.cit.edu"
                  autoComplete="email"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5] text-xs sm:text-sm text-[#1E1E1E] placeholder:text-[#9E9A92] focus:outline-none focus:ring-2 focus:ring-[#151515]/20 focus:border-[#151515] transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-bold text-[#1E1E1E] uppercase tracking-wider"
                >
                  Password
                </label>
                <span className="text-[11px] text-[#75716B] font-medium">
                  Min 4 characters
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#75716B]">
                  <Lock size={16} />
                </div>
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-11 py-2.5 rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5] text-xs sm:text-sm text-[#1E1E1E] placeholder:text-[#9E9A92] focus:outline-none focus:ring-2 focus:ring-[#151515]/20 focus:border-[#151515] transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#75716B] hover:text-[#1E1E1E] transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full bg-[#151515] hover:bg-black text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-[#E9A8CE]" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight size={15} className="text-[#E9A8CE]" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security details note */}
          <div className="mt-6 pt-5 border-t border-[#E8E1D5] flex items-center justify-between text-[11px] text-[#75716B]">
            <span>Secured via Supabase Auth REST &amp; JWT</span>
            <span className="font-semibold text-[#1E1E1E]">RBAC Anti-Self-Approval Active</span>
          </div>
        </div>

        {/* Right Column: Demo Accounts Quick Select (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#FFFDF8] border border-[#E8E1D5] rounded-[28px] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E9A8CE]" />
                <h3 className="font-extrabold text-sm text-[#1E1E1E]">
                  Evaluator Demo Accounts
                </h3>
              </div>
              <span className="text-[10px] font-bold text-[#6B530E] bg-[#F4DA69]/30 px-2 py-0.5 rounded-full">
                Hackathon Presets
              </span>
            </div>

            <p className="text-xs text-[#75716B] font-medium leading-relaxed">
              Select any role below to prefill credentials or click <strong>1-Click Sign In</strong> to test that persona immediately.
            </p>

            <div className="space-y-2.5">
              {DEMO_ACCOUNTS.map((acc) => {
                const isSelected = selectedDemoRole === acc.role;

                return (
                  <div
                    key={acc.email}
                    className={`p-3.5 rounded-2xl border transition-all text-left ${
                      isSelected
                        ? 'border-[#151515] bg-[#FAF6ED] ring-1 ring-[#151515]/20'
                        : 'border-[#E8E1D5] bg-[#FAF6ED]/40 hover:bg-[#FAF6ED]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#FFFDF8] border border-[#E8E1D5] flex items-center justify-center shrink-0">
                          {getRoleIcon(acc.role)}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-[#1E1E1E]">
                            {acc.roleName}
                          </div>
                          <div className="text-[11px] font-mono text-[#75716B]">
                            {acc.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectDemo(acc)}
                          className="px-2.5 py-1 text-[11px] font-bold text-[#1E1E1E] bg-[#FFFDF8] border border-[#E8E1D5] rounded-lg hover:bg-white transition-colors cursor-pointer"
                          title="Fill email and password in form"
                        >
                          Fill
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickLogin(acc)}
                          disabled={loading}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#151515] hover:bg-black rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          title="Instantly authenticate as this role"
                        >
                          Sign In
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-[#75716B] mt-2 leading-relaxed">
                      {acc.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="max-w-6xl w-full mx-auto pt-6 text-center text-xs text-[#75716B]">
        &copy; 2027 Chennai Institute of Technology • Automated Scheduling &amp; Venue Management System
      </div>
    </div>
  );
}

