/** @agentcenter/database - Ensure a profile is an active project member. */

import { prisma } from "../client";
import { ProjectMemberStatus } from "@agentcenter/utils";

/**
 * Upsert a project member record, setting status to ACTIVE.
 * Non-destructive: creates if missing, activates if previously inactive.
 */
export async function ensureProjectMember(
  projectId: string,
  profileId: string,
): Promise<void> {
  await prisma.projectMember
    .upsert({
      where: { projectId_profileId: { projectId, profileId } },
      create: { projectId, profileId },
      update: { status: ProjectMemberStatus.ACTIVE },
    })
    .catch(() => undefined);
}
