import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="w-11 h-11 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] flex items-center justify-center shadow-xs">
        <Loader2 className="h-5 w-5 animate-spin text-[#1E1E1E]" />
      </div>
      <p className="mt-3 text-xs font-semibold text-[#75716B] max-w-md text-center leading-relaxed">
        {message}
      </p>
    </div>
  );
}

