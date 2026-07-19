/**
 * Agent governance (Epic A.4). Workspace-scoped, enforceable governance of AI agents — distinct from
 * buildbase workspace settings (branding/members), which are the human plane. The one knob here,
 * `requireAgentApproval`, is enforced at agent PROVISIONING time: when on, a newly provisioned agent
 * starts `pending_setup` and the assignment-guard already blocks work until an admin activates it.
 */
import { prisma } from "@/server/prisma";
import { SetupStatus } from "@/server/constants";
import type { SetupStatusValue } from "@/server/constants";

export interface AgentGovernance {
  requireAgentApproval: boolean;
}

const DEFAULTS: AgentGovernance = { requireAgentApproval: false };

/** Read a workspace's governance policy (defaults when none has been set). */
export async function getAgentGovernance(workspaceId: string): Promise<AgentGovernance> {
  const row = await prisma.agentGovernancePolicy.findUnique({ where: { workspaceId } });
  return { requireAgentApproval: row?.requireAgentApproval ?? DEFAULTS.requireAgentApproval };
}

/** Upsert the workspace's governance policy. */
export async function setAgentGovernance(
  workspaceId: string,
  patch: Partial<AgentGovernance>,
): Promise<AgentGovernance> {
  const row = await prisma.agentGovernancePolicy.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      requireAgentApproval: patch.requireAgentApproval ?? DEFAULTS.requireAgentApproval,
    },
    update: {
      ...(patch.requireAgentApproval != null
        ? { requireAgentApproval: patch.requireAgentApproval }
        : {}),
    },
  });
  return { requireAgentApproval: row.requireAgentApproval };
}

/**
 * The `setupStatus` a newly provisioned agent should get in this workspace: `pending_setup` when
 * approval is required (blocks assignment until activated), otherwise `active`. The single source of
 * truth every provisioning path (team install, import) calls so the knob is enforced consistently.
 */
export async function provisionSetupStatus(workspaceId: string): Promise<SetupStatusValue> {
  const { requireAgentApproval } = await getAgentGovernance(workspaceId);
  return requireAgentApproval ? SetupStatus.PENDING_SETUP : SetupStatus.ACTIVE;
}
