import { useEffect, useRef, useCallback } from "react";

/**
 * Calls `callback` immediately, then on every `intervalMs` tick.
 * Stops when the component unmounts or when `enabled` is false.
 * Returns a `refetch` function to trigger a manual refresh.
 *
 * Works in React (web/Electron) and React Native.
 *
 * @example
 * const refetch = usePollingInterval(fetchCount, 30_000, isSignedIn);
 */
export function usePollingInterval(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
): () => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stableCallback = useCallback(() => {
    callbackRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    stableCallback();
    const id = setInterval(stableCallback, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, stableCallback]);

  return stableCallback;
}
