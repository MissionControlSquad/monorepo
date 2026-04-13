import { useState, useCallback } from "react";

export interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseAsyncReturn<T> extends UseAsyncState<T> {
  execute: (...args: Parameters<() => Promise<T>>) => Promise<T | null>;
  reset: () => void;
}

/**
 * Run an async operation and track its loading/error state.
 *
 * @example
 * const { execute, loading, error } = useAsync(async () => {
 *   const res = await fetch(API_ROUTES.agents.create, { method: "POST", body });
 *   if (!res.ok) throw new Error(await res.text());
 *   return res.json();
 * });
 */
export function useAsync<T>(fn: () => Promise<T>): UseAsyncReturn<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (): Promise<T | null> => {
    setState({ data: null, loading: true, error: null });
    try {
      const result = await fn();
      setState({ data: result, loading: false, error: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operation failed";
      setState({ data: null, loading: false, error: message });
      return null;
    }
  }, [fn]);

  const reset = useCallback(
    () => setState({ data: null, loading: false, error: null }),
    [],
  );

  return { ...state, execute, reset };
}
