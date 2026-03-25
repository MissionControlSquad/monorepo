import { useState, useMemo } from "react";

/**
 * Manages a search query string and filters a list of items using a caller-supplied
 * predicate. Works in React (web/Electron) and React Native.
 *
 * @param items   The full list to filter.
 * @param matchFn Called with (item, lowercased query) — return true to include.
 *
 * @example
 * const { search, setSearch, filtered } = useSearch(vms, (vm, q) =>
 *   vm.name.toLowerCase().includes(q) || vm.region.toLowerCase().includes(q)
 * );
 */
export function useSearch<T>(
  items: T[] | undefined | null,
  matchFn: (item: T, query: string) => boolean,
): {
  search: string;
  setSearch: (q: string) => void;
  filtered: T[];
} {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => matchFn(item, q));
  }, [items, search, matchFn]);

  return { search, setSearch, filtered };
}
