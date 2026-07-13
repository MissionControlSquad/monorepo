/**
 * Agent capability vocabulary + authorization logic (Epic #21). Shared across all apps
 * (web, mobile, desktop) — import from @agentcenter/utils; do NOT duplicate these as string literals.
 * The agent analog of a human permission key. Capabilities are enforced only when an agent is in
 * restricted mode (trust `changeConsentRequired`).
 */

/** Single source of truth for capability keys. Reference these — never a raw string. */
export const AGENT_CAPABILITY = {
  // Work
  TASKS_CHECKOUT: "tasks.checkout",
  TASKS_COMPLETE: "tasks.complete",
  QUEUE_CONSUME: "queue.consume",
  // Content
  DOCS_READ: "docs.read",
  DOCS_WRITE: "docs.write",
  MESSAGES_SEND: "messages.send",
  CHANNELS_POST: "channels.post",
  // Resources
  COST_REPORT: "cost.report",
  SECRETS_READ: "secrets.read",
  SKILLS_USE: "skills.use",
  // Elevated
  AGENTS_INVOKE: "agents.invoke",
  HOST_WRITE: "host.write",
  PR_MERGE: "pr.merge",
} as const;

export const AGENT_CAPABILITIES = Object.values(AGENT_CAPABILITY);
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export function isAgentCapability(value: string): value is AgentCapability {
  return (AGENT_CAPABILITIES as readonly string[]).includes(value);
}

/** Baseline capabilities every agent starts with, and the extra ones a lead/CEO role gets. */
export const AGENT_BASE_CAPABILITIES: AgentCapability[] = [
  AGENT_CAPABILITY.TASKS_CHECKOUT,
  AGENT_CAPABILITY.TASKS_COMPLETE,
  AGENT_CAPABILITY.QUEUE_CONSUME,
  AGENT_CAPABILITY.DOCS_READ,
  AGENT_CAPABILITY.DOCS_WRITE,
  AGENT_CAPABILITY.MESSAGES_SEND,
  AGENT_CAPABILITY.CHANNELS_POST,
  AGENT_CAPABILITY.COST_REPORT,
  AGENT_CAPABILITY.SKILLS_USE,
];
export const AGENT_LEAD_EXTRA_CAPABILITIES: AgentCapability[] = [AGENT_CAPABILITY.AGENTS_INVOKE];

/** Pure: the baseline capabilities an agent of this role starts with (before any explicit grants). */
export function defaultCapabilitiesForRole(role: string | null | undefined): string[] {
  const r = (role ?? "").toLowerCase();
  const isLead =
    r.includes("ceo") || r.includes("chief") || r.includes("lead") || r.includes("manager");
  return isLead
    ? [...AGENT_BASE_CAPABILITIES, ...AGENT_LEAD_EXTRA_CAPABILITIES]
    : [...AGENT_BASE_CAPABILITIES];
}

export interface AgentCanInput {
  role: string | null | undefined;
  trustProfile: { changeConsentRequired: boolean; executionAllowlist: string[] } | null;
  grants: { capability: string; projectScope: string | null }[];
  scope?: { projectId?: string | null };
}
export interface AgentCanDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Pure authorization decision (graphql-free, app-agnostic). Open mode (the default) allows everything
 * the route already permits. Restricted mode (trust `changeConsentRequired`) permits only capabilities
 * in role-defaults ∪ execution-allowlist ∪ explicit grants (scope-matched).
 */
export function agentCan(capability: string, input: AgentCanInput): AgentCanDecision {
  if (!input.trustProfile?.changeConsentRequired) {
    return { allowed: true, reason: "open mode (no change-consent restriction)" };
  }
  if (defaultCapabilitiesForRole(input.role).includes(capability)) {
    return { allowed: true, reason: "role default capability" };
  }
  if (input.trustProfile.executionAllowlist.includes(capability)) {
    return { allowed: true, reason: "in execution allowlist" };
  }
  const scopeId = input.scope?.projectId ?? null;
  const granted = input.grants.some(
    (g) => g.capability === capability && (g.projectScope === null || g.projectScope === scopeId),
  );
  if (granted) return { allowed: true, reason: "explicit grant" };
  return { allowed: false, reason: `restricted agent lacks capability '${capability}'` };
}

/** Agent authorization decision (Epic #21) — mirrors the AgentAuthzDecision enum. */
export const AGENT_AUTHZ_DECISION = { ALLOW: "allow", DENY: "deny" } as const;
export type AgentAuthzDecision = (typeof AGENT_AUTHZ_DECISION)[keyof typeof AGENT_AUTHZ_DECISION];
