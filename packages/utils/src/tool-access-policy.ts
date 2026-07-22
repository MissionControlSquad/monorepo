// Tool access-policy evaluator (parity #21 — the buildable-now data half). A declarative allow/deny
// list over tool names, scoped workspace-wide or per-agent. PURE — no I/O, so it's the tested core
// that a future tool runtime enforces. Nothing enforces it yet (the tool subsystem is absent); this
// is the model + resolution logic, ready to plug in.

export type ToolAccessEffect = "allow" | "deny";

export interface ToolAccessRule {
  id: string;
  /** null = workspace-wide; otherwise applies only to this agent. */
  agentId?: string | null;
  /** Exact tool name, or a glob with `*` (e.g. `github.*`, `*`). */
  toolPattern: string;
  effect: ToolAccessEffect;
  /** Higher wins ties after scope. */
  priority: number;
}

export interface ToolAccessDecision {
  decision: ToolAccessEffect;
  /** The rule that decided, or null when the default applied. */
  matchedRuleId: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match a tool name against a pattern. `*` is a wildcard for any run of characters. */
export function toolPatternMatches(pattern: string, toolName: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === toolName;
  const re = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return re.test(toolName);
}

// Specificity: exact patterns beat globs; longer literal content beats shorter.
function specificity(pattern: string): number {
  if (pattern === "*") return 0;
  return (pattern.includes("*") ? 1 : 1000) + pattern.replace(/\*/g, "").length;
}

/**
 * Resolve whether `toolName` is allowed for the given agent under `rules`. Precedence, highest first:
 *   1. scope — agent-scoped rules beat workspace-wide,
 *   2. priority — higher wins,
 *   3. specificity — a more specific pattern beats a broader one (an exact `github.read` allow
 *      overrides a `github.*` deny),
 *   4. effect — deny beats allow only on an otherwise-exact tie (fail-safe).
 * When no rule matches, `defaultEffect` applies (default "allow" — the policy restricts, it doesn't
 * lock down an empty config).
 */
export function evaluateToolAccess(
  rules: ToolAccessRule[],
  toolName: string,
  opts: { agentId?: string | null; defaultEffect?: ToolAccessEffect } = {},
): ToolAccessDecision {
  const defaultEffect = opts.defaultEffect ?? "allow";
  const applicable = rules.filter(
    (r) =>
      toolPatternMatches(r.toolPattern, toolName) &&
      (r.agentId == null || r.agentId === opts.agentId),
  );
  if (applicable.length === 0) return { decision: defaultEffect, matchedRuleId: null };

  const scopeRank = (r: ToolAccessRule) => (r.agentId != null ? 1 : 0);
  const effectRank = (r: ToolAccessRule) => (r.effect === "deny" ? 1 : 0);

  const winner = [...applicable].sort((a, b) => {
    if (scopeRank(b) !== scopeRank(a)) return scopeRank(b) - scopeRank(a);
    if (b.priority !== a.priority) return b.priority - a.priority;
    const specDelta = specificity(b.toolPattern) - specificity(a.toolPattern);
    if (specDelta) return specDelta;
    return effectRank(b) - effectRank(a); // deny beats allow only on an exact tie
  })[0];

  return { decision: winner.effect, matchedRuleId: winner.id };
}

/** Convenience: boolean form of {@link evaluateToolAccess}. */
export function isToolAllowed(
  rules: ToolAccessRule[],
  toolName: string,
  opts: { agentId?: string | null; defaultEffect?: ToolAccessEffect } = {},
): boolean {
  return evaluateToolAccess(rules, toolName, opts).decision === "allow";
}
