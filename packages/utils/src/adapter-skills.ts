// Runtime agent-skill reconcile (parity Domain 5 F22, pure half). Given an agent's DESIRED skills (the
// AgentSkill set + pinned/current version) and the runtime's ACTUAL reported state, compute each entry's
// sync state. PURE + testable; the actual push (materializing skill files into the agent's skills dir)
// happens where the agent runs (runner/gateway) — the infra seam. Ported from Paperclip adapter-skills.

/** How an adapter handles skills. unsupported = the runtime brings its own; we don't manage them. */
export type SkillSyncMode = "unsupported" | "persistent" | "ephemeral";

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
