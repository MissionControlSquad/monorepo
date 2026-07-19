/**
 * Skill governance policy engine (Domain 5 GAP-F) — pure, shared via @agentcenter/utils. A per-
 * workspace allow/deny policy over skill actions (create/import/install/edit/update/test/reset/remove)
 * × subjects (all_agents / specific agents / roles) × resource selectors (skillIds/skillKeys/
 * sourceTypes). Priority-ordered rule evaluation → { allowed, effect, matchedRuleId, reason,
 * remediation }. No I/O; the service loads the policy row and calls `evaluateSkillPolicy`. Ported from
 * Paperclip's skill-policy validators.
 */

export const SKILL_ACTIONS = [
  "create",
  "import",
  "install",
  "edit",
  "update",
  "test",
  "reset",
  "remove",
] as const;
export type SkillAction = (typeof SKILL_ACTIONS)[number];

export function isSkillAction(v: string): v is SkillAction {
  return (SKILL_ACTIONS as readonly string[]).includes(v);
}

export type PolicyEffect = "allow" | "deny";

/** Who a rule applies to. */
export type SkillPolicySubject =
  | { type: "all_agents" }
  | { type: "agents"; agentIds: string[] }
  | { type: "roles"; roles: string[] };

/** Which skills a rule applies to (all fields optional = matches any resource). */
export interface SkillPolicyResourceSelector {
  skillIds?: string[];
  skillKeys?: string[];
  sourceTypes?: string[];
}

export interface SkillPolicyRule {
  id: string;
  effect: PolicyEffect;
  /** Higher wins; ties broken by array order. */
  priority?: number;
  /** `["*"]` or omitted = all actions. */
  actions?: (SkillAction | "*")[];
  subjects?: SkillPolicySubject[];
  resources?: SkillPolicyResourceSelector;
  remediation?: string;
}

export interface SkillPolicy {
  defaultEffect: PolicyEffect;
  rules: SkillPolicyRule[];
}

/** The actor + target of a skill action, for evaluation. */
export interface SkillPolicyPrincipal {
  agentId?: string | null;
  role?: string | null;
}
export interface SkillPolicyResource {
  skillId?: string | null;
  skillKey?: string | null;
  sourceType?: string | null;
}

export interface SkillPolicyDecision {
  allowed: boolean;
  effect: PolicyEffect;
  matchedRuleId: string | null;
  reason: string;
  remediation?: string;
}

/** Credential-scrub a source locator before it is stored/logged (drop userinfo + query/token). */
export function normalizeSkillPolicySourceLocator(locator: string): string {
  let s = (locator ?? "").trim();
  // strip URL credentials user:pass@
  s = s.replace(/\/\/[^/@]*@/, "//");
  // strip token-ish query params
  s = s.replace(/([?&])(token|access_token|key|apikey|api_key|secret)=[^&#]*/gi, "$1$2=***");
  return s;
}

/** A locator is safe if it has no embedded credentials. */
export function isSafeSourceLocator(locator: string): boolean {
  return !/\/\/[^/@]*@/.test(locator) && !/(token|access_token|apikey|api_key|secret)=/i.test(locator);
}

function actionMatches(rule: SkillPolicyRule, action: SkillAction): boolean {
  if (!rule.actions || rule.actions.length === 0) return true;
  return rule.actions.includes("*") || rule.actions.includes(action);
}

function subjectMatches(rule: SkillPolicyRule, principal: SkillPolicyPrincipal): boolean {
  if (!rule.subjects || rule.subjects.length === 0) return true;
  return rule.subjects.some((s) => {
    if (s.type === "all_agents") return true;
    if (s.type === "agents") return !!principal.agentId && s.agentIds.includes(principal.agentId);
    if (s.type === "roles") return !!principal.role && s.roles.includes(principal.role);
    return false;
  });
}

function resourceMatches(rule: SkillPolicyRule, resource: SkillPolicyResource): boolean {
  const sel = rule.resources;
  if (!sel) return true;
  const any = (list: string[] | undefined, value: string | null | undefined) =>
    !list || list.length === 0 || (!!value && list.includes(value));
  // A selector with a dimension set requires the resource to match it; unset dimensions match anything.
  return (
    any(sel.skillIds, resource.skillId) &&
    any(sel.skillKeys, resource.skillKey) &&
    any(sel.sourceTypes, resource.sourceType)
  );
}

/**
 * Pure: evaluate a skill action. Rules are considered in priority order (higher first, then array
 * order); the first rule matching action + subject + resource decides. With no match, the policy's
 * defaultEffect applies.
 */
export function evaluateSkillPolicy(
  policy: SkillPolicy | null | undefined,
  input: {
    action: SkillAction;
    principal: SkillPolicyPrincipal;
    resource?: SkillPolicyResource;
  },
): SkillPolicyDecision {
  const resource = input.resource ?? {};
  const rules = [...(policy?.rules ?? [])]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.priority ?? 0) - (a.r.priority ?? 0) || a.i - b.i);

  for (const { r } of rules) {
    if (
      actionMatches(r, input.action) &&
      subjectMatches(r, input.principal) &&
      resourceMatches(r, resource)
    ) {
      return {
        allowed: r.effect === "allow",
        effect: r.effect,
        matchedRuleId: r.id,
        reason: `matched rule ${r.id} (${r.effect})`,
        remediation: r.remediation,
      };
    }
  }

  const defaultEffect = policy?.defaultEffect ?? "allow";
  return {
    allowed: defaultEffect === "allow",
    effect: defaultEffect,
    matchedRuleId: null,
    reason: `no rule matched — default ${defaultEffect}`,
  };
}
