/* ──────────────────────────────────────────────
 *  useApi — generic data-fetching hook
 *
 *  Manages loading / data / error state for any
 *  async API call.  Call `refetch()` to re-run.
 * ────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * @param fetcher – async function that returns data of type T.
 *                  Must be a stable reference (module-level fn or
 *                  wrapped in useCallback at the call-site).
 */
export function useApi<T>(fetcher: () => Promise<T>): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetcher();
        if (!cancelled && mountedRef.current) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(
            err instanceof Error ? err.message : 'An unexpected error occurred',
          );
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [fetcher, fetchKey]);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return { data, loading, error, refetch };
}
