import { useState, useEffect } from "react";

/**
 * SSR-safe reactive hook that tracks a CSS media query.
 * Returns `false` during SSR and on first render, then syncs with the real value.
 * Browser/Electron only — not supported in React Native.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    if (mql.matches !== matches) setMatches(mql.matches);

    function onChange(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
