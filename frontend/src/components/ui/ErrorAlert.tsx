import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-rose-800">
            Failed to load data
          </h3>
          <p className="mt-1 text-sm text-rose-700">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

