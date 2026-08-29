// Rule-based approval-policy evaluator (governance depth). Agent approval used to be a single coarse
// bool (`requireAgentApproval`) + trust flags. This is a small declarative RULE engine: priority-ordered
// policies, FIRST MATCH WINS, DEFAULT ALLOW when nothing matches. PURE — no I/O — so it is the tested
// core the approval path consults. The web service loads the workspace's policies and calls
// `evaluateApprovalPolicy`; a `require_approval` result creates an Approval, `deny` refuses, `allow`
// proceeds, and NO MATCH falls back to the existing coarse behavior.

export type ApprovalEffect = "allow" | "require_approval" | "deny";

/** Trust ladder, lowest → highest. Mirrors @agentcenter TrustLevel. */
export type ApprovalTrustLevel = "untrusted" | "low" | "standard" | "trusted";

const TRUST_ORDER: ApprovalTrustLevel[] = ["untrusted", "low", "standard", "trusted"];

/** Numeric rank of a trust level (untrusted=0 … trusted=3). */
export function approvalTrustRank(level: ApprovalTrustLevel): number {
  const i = TRUST_ORDER.indexOf(level);
  return i < 0 ? 0 : i;
}

/** The actions a policy can gate. `"*"` matches any action. */
export const APPROVAL_ACTIONS = ["hire_agent", "run", "spend_over", "tool_call"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_EFFECTS: ApprovalEffect[] = ["allow", "require_approval", "deny"];

/**
 * Which agents a policy applies to. An empty subject (or `{all:true}`) applies to ALL agents. When
 * selectors are present the subject matches if ANY of them matches the context (OR) — e.g. "this
 * specific agent, or any agent with role X, or any untrusted agent".
 */
export interface ApprovalPolicySubject {
  all?: boolean;
  agentIds?: string[];
  roles?: string[];
  trustLevels?: ApprovalTrustLevel[];
}

/**
 * A JSON predicate over the action's context. When multiple keys are present ALL must hold (AND). A
 * condition that references data the context lacks (e.g. `costCentsOver` when no cost is supplied) does
 * NOT match — the policy is skipped and evaluation falls through to the next one.
 */
export interface ApprovalPolicyCondition {
  /** ctx.costCents strictly greater than this. */
  costCentsOver?: number;
  /** ctx.trustLevel strictly below this level on the trust ladder. */
  trustBelow?: ApprovalTrustLevel;
}

export interface ApprovalPolicyRule {
  id: string;
  priority: number;
  action: string;
  effect: ApprovalEffect;
  subject?: ApprovalPolicySubject | null;
  condition?: ApprovalPolicyCondition | null;
  /** Disabled policies are ignored. Defaults to enabled when omitted. */
  enabled?: boolean;
}

export interface ApprovalPolicyContext {
  action: string;
  agentId?: string | null;
  agentRole?: string | null;
  trustLevel?: ApprovalTrustLevel | null;
  costCents?: number | null;
}

export interface ApprovalPolicyDecision {
  effect: ApprovalEffect;
  /** The policy that decided, or null when no policy matched (default allow). */
  matchedPolicyId: string | null;
}

function isNonEmpty<T>(arr: T[] | undefined | null): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

/** Whether a policy's subject applies to the context's agent. Empty / `all` → every agent. */
export function subjectMatches(
  subject: ApprovalPolicySubject | null | undefined,
  ctx: ApprovalPolicyContext,
): boolean {
  if (!subject || subject.all) return true;
  const selectors: boolean[] = [];
  if (isNonEmpty(subject.agentIds)) {
    selectors.push(ctx.agentId != null && subject.agentIds.includes(ctx.agentId));
  }
  if (isNonEmpty(subject.roles)) {
    selectors.push(ctx.agentRole != null && subject.roles.includes(ctx.agentRole));
  }
  if (isNonEmpty(subject.trustLevels)) {
    selectors.push(ctx.trustLevel != null && subject.trustLevels.includes(ctx.trustLevel));
  }
  // No discriminating selectors → applies to all.
  if (selectors.length === 0) return true;
  // OR across the provided selectors.
  return selectors.some(Boolean);
}

/** Whether every present condition key holds for the context (AND). Empty condition → always true. */
export function conditionMatches(
  condition: ApprovalPolicyCondition | null | undefined,
  ctx: ApprovalPolicyContext,
): boolean {
  if (!condition) return true;
  if (condition.costCentsOver != null) {
    if (ctx.costCents == null || !(ctx.costCents > condition.costCentsOver)) return false;
  }
  if (condition.trustBelow != null) {
    if (ctx.trustLevel == null) return false;
    if (!(approvalTrustRank(ctx.trustLevel) < approvalTrustRank(condition.trustBelow))) return false;
  }
  return true;
}

function actionMatches(policyAction: string, ctxAction: string): boolean {
  return policyAction === "*" || policyAction === ctxAction;
}

/**
 * Resolve the effect for an action under `policies`. Precedence: enabled policies whose action,
 * subject, AND condition all match, ordered by `priority` (higher first) then `id` (stable tie-break);
 * the first one wins. When nothing matches the default is ALLOW — the engine restricts, it does not
 * lock down an empty config (callers layer the existing coarse behavior on a null match).
 */
export function evaluateApprovalPolicy(
  policies: ApprovalPolicyRule[],
  ctx: ApprovalPolicyContext,
): ApprovalPolicyDecision {
  const applicable = policies.filter(
    (p) =>
      p.enabled !== false &&
      actionMatches(p.action, ctx.action) &&
      subjectMatches(p.subject, ctx) &&
      conditionMatches(p.condition, ctx),
  );
  if (applicable.length === 0) return { effect: "allow", matchedPolicyId: null };

  const winner = [...applicable].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];

  return { effect: winner.effect, matchedPolicyId: winner.id };
}

/** Convenience: true when the resolved effect is a hard `deny`. */
export function isApprovalDenied(
  policies: ApprovalPolicyRule[],
  ctx: ApprovalPolicyContext,
): boolean {
  return evaluateApprovalPolicy(policies, ctx).effect === "deny";
}
