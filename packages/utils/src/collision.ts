/**
 * Name-collision resolution + slug helpers — shared across all apps (Epic #10; reused by #14). Import
 * from @agentcenter/utils. Pure. Used by skills, teams, and workspace portability.
 */
export const COLLISION_STRATEGIES = ["rename", "skip", "replace"] as const;
export type CollisionStrategy = (typeof COLLISION_STRATEGIES)[number];
export type CollisionAction = "create" | "skip" | "replace";

export function isCollisionStrategy(v: string): v is CollisionStrategy {
  return (COLLISION_STRATEGIES as readonly string[]).includes(v);
}

/** Pure: turn a name into a URL-safe slug. Optional `maxLength` cap + `fallback` for an empty result. */
export function slugify(name: string, maxLength = 0, fallback = ""): string {
  let s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (maxLength > 0) s = s.slice(0, maxLength);
  return s || fallback;
}

/**
 * Pure: resolve a name against a set of existing names under a collision strategy. `rename` finds the
 * first free `<name>-N`; `skip`/`replace` return their action.
 */
export function resolveCollision(
  existing: string[],
  name: string,
  strategy: CollisionStrategy,
): { action: CollisionAction; name: string } {
  const set = new Set(existing);
  if (!set.has(name)) return { action: "create", name };
  if (strategy === "skip") return { action: "skip", name };
  if (strategy === "replace") return { action: "replace", name };
  // rename → find the first free "<name>-N".
  let n = 2;
  let candidate = `${name}-${n}`;
  while (set.has(candidate)) candidate = `${name}-${++n}`;
  return { action: "create", name: candidate };
}
