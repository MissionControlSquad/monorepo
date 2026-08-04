import { prisma } from "@/server/prisma";
import {
  adapterSkillMode,
  reconcileAgentSkills,
  type ActualSkill,
  type SkillReconcileResult,
} from "@agentcenter/utils";

// Agent skill sync (parity Domain 5 F22). Assembles an agent's DESIRED skills (AgentSkill set +
// pinned/current version) and reconciles them against the runtime's ACTUAL reported state via the pure
// state machine. The push (materializing skill files into the agent's skills dir) happens where the
// agent runs — the infra seam. Workspace-scoped.

/**
 * Snapshot an agent's skill sync state. `actual` is what the runtime last reported (empty when the agent
 * has never synced — everything then reads as missing/configured). Adapter mode is derived from the
 * agent's runtimeAdapter.
 */
export async function getAgentSkillSnapshot(
  workspaceId: string,
  agentId: string,
  actual: ActualSkill[] = [],
): Promise<SkillReconcileResult & { agentId: string; adapterType: string | null }> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { runtimeAdapter: true },
  });
  const adapterType = agent?.runtimeAdapter ?? null;

  const links = await prisma.agentSkill.findMany({
    where: { agentId, workspaceId },
    include: { skill: { select: { currentVersion: true } } },
  });
  const desired = links.map((l) => ({
    skillId: l.skillId,
    version: l.pinnedVersion ?? l.skill.currentVersion,
  }));

  const result = reconcileAgentSkills(desired, actual, adapterSkillMode(adapterType));
  return { ...result, agentId, adapterType };
}

/**
 * Set an agent's desired skills (F22 syncAgentSkills): replace the AgentSkill set with the given
 * skillIds (+ optional pinnedVersion), validating each skill is readable in the workspace. Returns the
 * fresh snapshot. The actual push to the runtime is triggered separately (the seam).
 */
export async function syncAgentSkills(
  workspaceId: string,
  agentId: string,
  desiredSkills: { skillId: string; pinnedVersion?: number | null }[],
): Promise<SkillReconcileResult & { agentId: string; adapterType: string | null }> {
  const ids = [...new Set(desiredSkills.map((d) => d.skillId))];
  const valid = await prisma.skill.findMany({
    where: { id: { in: ids }, OR: [{ workspaceId }, { sharingScope: "public" }] },
    select: { id: true },
  });
  const validIds = new Set(valid.map((s) => s.id));

  await prisma.$transaction(async (tx) => {
    await tx.agentSkill.deleteMany({ where: { agentId, workspaceId } });
    const rows = desiredSkills
      .filter((d) => validIds.has(d.skillId))
      .map((d) => ({
        workspaceId,
        agentId,
        skillId: d.skillId,
        pinnedVersion: d.pinnedVersion ?? null,
      }));
    if (rows.length) await tx.agentSkill.createMany({ data: rows, skipDuplicates: true });
  });

  return getAgentSkillSnapshot(workspaceId, agentId);
}
