/**
 * Agent authorization — capability grants + enforcement (Epic #21). The agent analog of a human role:
 * grant a capability to an agent (optionally project-scoped), then enforce it. Unifies the flat
 * AgentTrustProfile.executionAllowlist into a real grant model. Default-open (non-breaking) — a check
 * only bites when an agent is restricted (trust `changeConsentRequired`). Ports the intent of Paperclip
 * `principal_permission_grants` (principalType=agent) + `agent-permissions.ts`.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { isAgentCapability, agentCan, FLAG_KEYS } from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import type { AgentCapabilityGrant, AgentAuthzEvent } from "@agentcenter/database";

// Pure authorization logic (agentCan, defaultCapabilitiesForRole) + the capability vocabulary live in
// @agentcenter/utils so web/desktop/mobile share one source of truth. This file is only DB/IO.

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

async function requireAgent(
  workspaceId: string,
  agentId: string,
): Promise<{ id: string; role: string }> {
  const agent = await prisma.agent.findFirst({
    where: { workspaceId, id: agentId },
    select: { id: true, role: true },
  });
  if (!agent) badRequest("agentId does not reference an agent in this workspace");
  return agent;
}

export function listAgentGrants(
  workspaceId: string,
  agentId: string,
): Promise<AgentCapabilityGrant[]> {
  return requireAgent(workspaceId, agentId).then(() =>
    prisma.agentCapabilityGrant.findMany({ where: { agentId }, orderBy: { createdAt: "desc" } }),
  );
}

export async function grantAgentCapability(args: {
  workspaceId: string;
  agentId: string;
  capability: string;
  projectScope?: string | null;
  grantedByProfileId?: string | null;
}): Promise<AgentCapabilityGrant> {
  await requireAgent(args.workspaceId, args.agentId);
  if (!isAgentCapability(args.capability))
    badRequest(`Unknown agent capability '${args.capability}'`);
  const scope = args.projectScope ?? null;
  const existing = await prisma.agentCapabilityGrant.findFirst({
    where: { agentId: args.agentId, capability: args.capability, projectScope: scope },
  });
  if (existing) return existing; // idempotent
  return prisma.agentCapabilityGrant.create({
    data: {
      agentId: args.agentId,
      capability: args.capability,
      projectScope: scope,
      grantedByProfileId: args.grantedByProfileId ?? null,
    },
  });
}

export async function revokeAgentCapability(
  workspaceId: string,
  grantId: string,
): Promise<boolean> {
  const grant = await prisma.agentCapabilityGrant.findUnique({
    where: { id: grantId },
    select: { id: true, agent: { select: { workspaceId: true } } },
  });
  if (!grant || grant.agent.workspaceId !== workspaceId) badRequest("Grant not found");
  await prisma.agentCapabilityGrant.delete({ where: { id: grantId } });
  return true;
}

export function listAuthzEvents(workspaceId: string, agentId: string): Promise<AgentAuthzEvent[]> {
  return requireAgent(workspaceId, agentId).then(() =>
    prisma.agentAuthzEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

/**
 * Enforcement entry point for agent-facing routes: resolve the agent's role + trust profile + grants,
 * decide, record an audit event on DENIAL, and throw 403 when denied. Non-breaking: an agent with no
 * restrictive trust profile is always allowed.
 */
export async function requireAgentCapability(
  agent: { id: string; role: string },
  capability: string,
  scope?: { projectId?: string | null },
): Promise<void> {
  // Kill-switch: with agent authorization disabled, enforcement is skipped entirely.
  if (!(await isFeatureEnabled(FLAG_KEYS.AGENT_AUTHZ))) return;
  const [trust, grants] = await Promise.all([
    prisma.agentTrustProfile.findUnique({
      where: { agentId: agent.id },
      select: { changeConsentRequired: true, executionAllowlist: true },
    }),
    prisma.agentCapabilityGrant.findMany({
      where: { agentId: agent.id },
      select: { capability: true, projectScope: true },
    }),
  ]);
  const decision = agentCan(capability, { role: agent.role, trustProfile: trust, grants, scope });
  if (!decision.allowed) {
    await prisma.agentAuthzEvent.create({
      data: {
        agentId: agent.id,
        capability,
        decision: "deny",
        projectScope: scope?.projectId ?? null,
        reason: decision.reason,
      },
    });
    throw new GraphQLError("Agent is not authorized for this action", {
      extensions: { code: "FORBIDDEN", capability },
    });
  }
}
