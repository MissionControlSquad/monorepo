/**
 * Skill governance policy service (Domain 5 GAP-F). Stores + evaluates a per-workspace allow/deny
 * policy over skill actions. The evaluator is pure (@agentcenter/utils); this owns persistence,
 * optimistic-concurrency replace, and an assertSkillAction guard the skill mutations call. Default
 * (no policy row) = allow, so existing behavior is preserved until a workspace writes rules.
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import {
  evaluateSkillPolicy,
  type SkillPolicy,
  type SkillAction,
  type SkillPolicyPrincipal,
  type SkillPolicyResource,
  type SkillPolicyRule,
  type PolicyEffect,
} from "@agentcenter/utils";

const DEFAULT_POLICY: SkillPolicy = { defaultEffect: "allow", rules: [] };

/** The workspace's policy document (defaults to allow-all when unset). */
export async function getSkillPolicy(
  workspaceId: string,
): Promise<SkillPolicy & { revision: number }> {
  const row = await prisma.skillPolicy.findUnique({ where: { workspaceId } });
  if (!row) return { ...DEFAULT_POLICY, revision: 0 };
  return {
    defaultEffect: (row.defaultEffect as PolicyEffect) ?? "allow",
    rules: (row.rules as unknown as SkillPolicyRule[]) ?? [],
    revision: row.revision,
  };
}

function validatePolicy(defaultEffect: string, rules: unknown): asserts rules is SkillPolicyRule[] {
  if (defaultEffect !== "allow" && defaultEffect !== "deny")
    throw new GraphQLError("defaultEffect must be 'allow' or 'deny'", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  if (!Array.isArray(rules))
    throw new GraphQLError("rules must be an array", { extensions: { code: "BAD_USER_INPUT" } });
  for (const r of rules as SkillPolicyRule[]) {
    if (!r || typeof r.id !== "string" || !r.id)
      throw new GraphQLError("each rule needs a string id", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    if (r.effect !== "allow" && r.effect !== "deny")
      throw new GraphQLError(`rule ${r.id}: effect must be allow|deny`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
  }
}

/**
 * Replace the whole policy document (admin). Optimistic concurrency: pass the revision you read; a
 * mismatch means someone else changed it (409-style). Increments revision on success.
 */
export async function replaceSkillPolicy(input: {
  workspaceId: string;
  defaultEffect: string;
  rules: unknown;
  expectedRevision?: number | null;
  updatedByProfileId?: string | null;
}): Promise<SkillPolicy & { revision: number }> {
  validatePolicy(input.defaultEffect, input.rules);
  const current = await prisma.skillPolicy.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { revision: true },
  });
  const currentRevision = current?.revision ?? 0;
  if (input.expectedRevision != null && input.expectedRevision !== currentRevision)
    throw new GraphQLError(
      `policy was modified concurrently (expected revision ${input.expectedRevision}, got ${currentRevision})`,
      { extensions: { code: "CONFLICT" } },
    );

  const row = await prisma.skillPolicy.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      defaultEffect: input.defaultEffect,
      rules: input.rules as never,
      revision: 1,
      updatedByProfileId: input.updatedByProfileId ?? null,
    },
    update: {
      defaultEffect: input.defaultEffect,
      rules: input.rules as never,
      revision: currentRevision + 1,
      updatedByProfileId: input.updatedByProfileId ?? null,
    },
  });
  return {
    defaultEffect: row.defaultEffect as PolicyEffect,
    rules: row.rules as unknown as SkillPolicyRule[],
    revision: row.revision,
  };
}

/** Evaluate an action without enforcing (debug / UI "why blocked"). */
export async function evaluateSkillAction(
  workspaceId: string,
  action: SkillAction,
  principal: SkillPolicyPrincipal,
  resource?: SkillPolicyResource,
) {
  const policy = await getSkillPolicy(workspaceId);
  return evaluateSkillPolicy(policy, { action, principal, resource });
}

/**
 * Enforce a skill action — throws FORBIDDEN when the policy denies it. Called at the top of every skill
 * mutation. A workspace with no policy (default allow) never throws.
 */
export async function assertSkillAction(
  workspaceId: string,
  action: SkillAction,
  principal: SkillPolicyPrincipal,
  resource?: SkillPolicyResource,
): Promise<void> {
  const decision = await evaluateSkillAction(workspaceId, action, principal, resource);
  if (!decision.allowed) {
    throw new GraphQLError(
      `Skill action '${action}' is denied by policy${decision.remediation ? `: ${decision.remediation}` : ""}`,
      { extensions: { code: "FORBIDDEN", matchedRuleId: decision.matchedRuleId } },
    );
  }
}
