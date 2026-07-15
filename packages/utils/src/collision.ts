/**
 * Name-collision resolution + slug helpers — shared across all apps (Epic #10; reused by #14). Import
 * from @agentcenter/utils. Pure. Used by skills, teams, and workspace portability.
 */
export const COLLISION_STRATEGY = { RENAME: "rename", SKIP: "skip", REPLACE: "replace" } as const;
export const COLLISION_STRATEGIES = Object.values(COLLISION_STRATEGY);
export type CollisionStrategy = (typeof COLLISION_STRATEGIES)[number];

export const COLLISION_ACTION = { CREATE: "create", SKIP: "skip", REPLACE: "replace" } as const;
export type CollisionAction = (typeof COLLISION_ACTION)[keyof typeof COLLISION_ACTION];

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
  if (!set.has(name)) return { action: COLLISION_ACTION.CREATE, name };
  if (strategy === COLLISION_STRATEGY.SKIP) return { action: COLLISION_ACTION.SKIP, name };
  if (strategy === COLLISION_STRATEGY.REPLACE) return { action: COLLISION_ACTION.REPLACE, name };
  // rename → find the first free "<name>-N".
  let n = 2;
  let candidate = `${name}-${n}`;
  while (set.has(candidate)) candidate = `${name}-${++n}`;
  return { action: "create", name: candidate };
}

export interface CollisionPlanItem {
  /** The requested/source name. */
  name: string;
  action: CollisionAction;
  /** For `create`, the (possibly renamed) name to use; for skip/replace, the same as `name`. */
  resolvedName: string;
}

/**
 * Pure: resolve a whole batch of names sequentially against `existing`, threading each `create`
 * back into the taken set so intra-batch renames don't collide with each other. This is the
 * dry-run plan behind a team/skill install — it never touches the DB.
 */
export function planCollisions(
  existing: string[],
  names: string[],
  strategy: CollisionStrategy,
): CollisionPlanItem[] {
  const taken = [...existing];
  const plan: CollisionPlanItem[] = [];
  for (const name of names) {
    const res = resolveCollision(taken, name, strategy);
    if (res.action === COLLISION_ACTION.CREATE) taken.push(res.name);
    plan.push({ name, action: res.action, resolvedName: res.name });
  }
  return plan;
}
