import type { ReactNode } from "react";

/**
 * Standardizes the list-page `skeleton → empty → list` render that was hand-rolled on every list page.
 * Shows the skeleton while fetching with nothing loaded yet, the empty state when the (settled) list is
 * empty, otherwise the children called with the non-empty items.
 *
 *   <AsyncList
 *     items={items} fetching={fetching}
 *     skeleton={<SkeletonList rows={5} />}
 *     empty={<EmptyState icon={Box} title="No assets yet" description="…" />}
 *   >
 *     {(items) => items.map((it) => <Row key={it.id} {...it} />)}
 *   </AsyncList>
 */
export function AsyncList<T>({
  items,
  fetching,
  skeleton,
  empty,
  children,
}: {
  items: T[];
  fetching: boolean;
  skeleton: ReactNode;
  empty: ReactNode;
  children: (items: T[]) => ReactNode;
}) {
  if (fetching && items.length === 0) return <>{skeleton}</>;
  if (items.length === 0) return <>{empty}</>;
  return <>{children(items)}</>;
}
