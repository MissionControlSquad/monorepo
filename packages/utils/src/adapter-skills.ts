// Runtime agent-skill reconcile (parity Domain 5 F22, pure half). Given an agent's DESIRED skills (the
// AgentSkill set + pinned/current version) and the runtime's ACTUAL reported state, compute each entry's
// sync state. PURE + testable; the actual push (materializing skill files into the agent's skills dir)
// happens where the agent runs (runner/gateway) — the infra seam. Ported from Paperclip adapter-skills.

/** How an adapter handles skills. unsupported = the runtime brings its own; we don't manage them. */
export type SkillSyncMode = "unsupported" | "persistent" | "ephemeral";

/**
 * How a skill-sync request MERGES the requested skill set into an agent's current desired set
 * (parity Paperclip #10978 "require explicit merge modes"). Callers must choose explicitly so reruns
 * never silently discard operator edits:
 *   - `add`     union: keep current, add requested (requested wins on version conflicts). Non-destructive.
 *   - `remove`  delete only the requested skills from the current set; leave the rest untouched.
 *   - `replace` overwrite: the requested set becomes the complete desired set (the legacy behavior).
 */
export type SkillMergeMode = "add" | "remove" | "replace";

/** The three valid merge modes, for validation/enum registration. */
export const SKILL_MERGE_MODES = ["add", "remove", "replace"] as const;

/** A desired-skill selection keyed by skillId, with an optional pinned version. */
export interface DesiredSkillEntry {
  skillId: string;
  pinnedVersion?: number | null;
}

/**
 * PURE set-math for merge modes. Given the agent's `current` desired entries and the `requested` entries,
 * return the final desired set for the chosen `mode`. Keyed by skillId — no I/O, no dedupe surprises.
 * Mirrors Paperclip's `mergeDesiredSkillEntries`. `replace` ignores `current`; `remove` ignores requested
 * versions (it only needs the keys); `add` unions with requested overriding current on the same skillId.
 */
export function applySkillMergeMode(
  current: DesiredSkillEntry[],
  requested: DesiredSkillEntry[],
  mode: SkillMergeMode,
): DesiredSkillEntry[] {
  if (mode === "replace") return requested;

  const requestedKeys = new Set(requested.map((e) => e.skillId));
  if (mode === "remove") {
    return current.filter((e) => !requestedKeys.has(e.skillId));
  }

  // add: union, requested entry wins on the same skillId (so a re-pin updates the version).
  const merged = new Map(current.map((e) => [e.skillId, e]));
  for (const e of requested) merged.set(e.skillId, e);
  return Array.from(merged.values());
}

export type SkillEntryState =
  | "installed" // desired, present on runtime, version matches
  | "stale" // desired, present, but the runtime version differs from desired
  | "missing" // desired (persistent adapter) but absent on the runtime → needs a push
  | "configured" // desired (ephemeral adapter) — materialized fresh each run, not persistently installed
  | "external"; // present on the runtime but not desired (or an unsupported adapter owns it)

export interface DesiredSkill {
  skillId: string;
  version: number; // pinnedVersion ?? Skill.currentVersion
}
export interface ActualSkill {
  skillId: string;
  installedVersion: number;
}
export interface SkillEntry {
  skillId: string;
  state: SkillEntryState;
  desiredVersion: number | null;
  actualVersion: number | null;
}
export interface SkillReconcileResult {
  mode: SkillSyncMode;
  entries: SkillEntry[];
  warnings: string[];
}

/** The skill-sync mode for a known adapter type. Unknown adapters default to `unsupported` (safe). */
export function adapterSkillMode(adapterType: string | null | undefined): SkillSyncMode {
  switch (adapterType) {
    case "claude":
    case "claude-local":
    case "openclaw":
    case "openclaw-gateway":
      return "persistent"; // a stable skills dir the runtime reads
    case "codex":
    case "codex-local":
    case "gemini":
    case "gemini-local":
      return "ephemeral"; // materialized per invocation
    default:
      return "unsupported";
  }
}

/**
 * Reconcile desired vs actual skills for an adapter mode. Deterministic. `unsupported` → every actual is
 * `external` (the runtime owns them). Otherwise each desired skill is installed/stale/missing/configured
 * and any actual-but-not-desired skill is `external`.
 */
export function reconcileAgentSkills(
  desired: DesiredSkill[],
  actual: ActualSkill[],
  mode: SkillSyncMode,
): SkillReconcileResult {
  const warnings: string[] = [];
  const actualById = new Map(actual.map((a) => [a.skillId, a.installedVersion]));
  const desiredIds = new Set(desired.map((d) => d.skillId));
  const entries: SkillEntry[] = [];

  if (mode === "unsupported") {
    for (const a of actual)
      entries.push({ skillId: a.skillId, state: "external", desiredVersion: null, actualVersion: a.installedVersion });
    if (desired.length)
      warnings.push(`adapter does not support managed skills; ${desired.length} desired skill(s) ignored`);
    return { mode, entries, warnings };
  }

  for (const d of desired) {
    const actualVersion = actualById.get(d.skillId);
    let state: SkillEntryState;
    if (actualVersion === undefined) state = mode === "ephemeral" ? "configured" : "missing";
    else if (actualVersion === d.version) state = "installed";
    else state = "stale";
    entries.push({ skillId: d.skillId, state, desiredVersion: d.version, actualVersion: actualVersion ?? null });
  }

  // Present on the runtime but no longer desired.
  for (const a of actual) {
    if (!desiredIds.has(a.skillId))
      entries.push({ skillId: a.skillId, state: "external", desiredVersion: null, actualVersion: a.installedVersion });
  }

  return { mode, entries, warnings };
}
