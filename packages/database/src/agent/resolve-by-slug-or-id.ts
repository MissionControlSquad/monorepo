/** @agentcenter/database - Resolve an agent by DB primary key or gateway slug. */

import { prisma } from "../client";

/**
 * Find an agent using agentId (primary key) first, falling back to username slug.
 * agentId comes from IDENTITY.md on the plugin side — reliable across renames.
 * Returns only { id } to keep the hot path lean.
 */
export async function resolveAgentBySlugOrId(
  slug: string,
  agentId?: string | null,
): Promise<{ id: string } | null> {
  if (agentId) {
    const byId = await prisma.agent
      .findUnique({ where: { id: agentId }, select: { id: true } })
      .catch(() => null);
    if (byId) return byId;
    console.warn(
      `[database] Agent ID "${agentId}" not found, falling back to username lookup for slug "${slug}"`,
    );
  }
  return prisma.agent
    .findUnique({ where: { username: slug }, select: { id: true } })
    .catch(() => null);
}
