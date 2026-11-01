import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="rounded-[20px] border border-[#E9A8CE]/60 bg-[#FFFDF8] p-5 shadow-[0_2px_12px_rgba(30,30,30,0.02)]">
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-[14px] bg-[#E9A8CE]/30 text-[#8B2356] flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold text-[#1E1E1E] uppercase tracking-wide">
            Operation Error
          </h3>
          <p className="mt-1 text-xs text-[#75716B] leading-relaxed">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E1D5] bg-[#F8F3E7] px-3.5 py-1.5 text-xs font-semibold text-[#1E1E1E] shadow-2xs transition-colors hover:bg-[#EFE8DA] cursor-pointer shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}

