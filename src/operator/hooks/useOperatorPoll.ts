import { useState, useEffect, useCallback, useRef } from 'react';

interface PollResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

function usePoll<T>(
  fn: () => Promise<T> | T,
  intervalMs: number,
  deps: unknown[] = [],
): PollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const execute = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fnRef.current();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    execute();
    const id = setInterval(() => {
      if (document.hidden) return;
      execute();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, execute, ...deps]);

  const refresh = useCallback(() => {
    execute();
  }, [execute]);

  return { data, error, loading, refresh };
}

export { usePoll, usePoll as useOperatorPoll };
