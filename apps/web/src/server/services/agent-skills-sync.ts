import { prisma } from "@/server/prisma";
import {
  adapterSkillMode,
  applySkillMergeMode,
  reconcileAgentSkills,
  type ActualSkill,
  type SkillMergeMode,
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
 * Merge the requested skills into an agent's desired AgentSkill set under an explicit `mode`
 * (parity Paperclip #10978). Each requested skill is validated as readable in the workspace before it can
 * be persisted; the pure {@link applySkillMergeMode} then computes the final desired set against what the
 * agent currently has:
 *   - `add`     union — keep current links, add the requested ones (non-destructive).
 *   - `remove`  delete only the requested links; the rest of the current set is untouched.
 *   - `replace` overwrite the whole set with the requested skills (the legacy default).
 * `mode` defaults to `replace` for backward-compat with existing callers. Returns the fresh snapshot;
 * the actual push to the runtime is triggered separately (the seam).
 */
export async function syncAgentSkills(
  workspaceId: string,
  agentId: string,
  desiredSkills: { skillId: string; pinnedVersion?: number | null }[],
  mode: SkillMergeMode = "replace",
): Promise<SkillReconcileResult & { agentId: string; adapterType: string | null }> {
  // `remove` only needs the keys, so its skills need not be readable (they are being dropped). `add` and
  // `replace` persist new links, so their skills must be readable in the workspace.
  let requested = desiredSkills;
  if (mode !== "remove") {
    const ids = [...new Set(desiredSkills.map((d) => d.skillId))];
    const valid = await prisma.skill.findMany({
      where: { id: { in: ids }, OR: [{ workspaceId }, { sharingScope: "public" }] },
      select: { id: true },
    });
    const validIds = new Set(valid.map((s) => s.id));
    requested = desiredSkills.filter((d) => validIds.has(d.skillId));
  }

  await prisma.$transaction(async (tx) => {
    const current = (
      await tx.agentSkill.findMany({
        where: { agentId, workspaceId },
        select: { skillId: true, pinnedVersion: true },
      })
    ).map((l) => ({ skillId: l.skillId, pinnedVersion: l.pinnedVersion }));

    const finalSet = applySkillMergeMode(current, requested, mode);

    await tx.agentSkill.deleteMany({ where: { agentId, workspaceId } });
    const rows = finalSet.map((d) => ({
      workspaceId,
      agentId,
      skillId: d.skillId,
      pinnedVersion: d.pinnedVersion ?? null,
    }));
    if (rows.length) await tx.agentSkill.createMany({ data: rows, skipDuplicates: true });
  });

  return getAgentSkillSnapshot(workspaceId, agentId);
}
