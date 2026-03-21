/**
 * @agentcenter/database - Feature Flag Operations
 *
 * CRUD operations for feature flags.
 */

import { prisma } from "../client";

export async function listAllFeatureFlags() {
  return prisma.featureFlag.findMany();
}

export async function findFeatureFlagByKey(key: string) {
  return prisma.featureFlag.findUnique({ where: { key } });
}

export async function updateFeatureFlag(key: string, data: { enabled?: boolean; description?: string | null }) {
  return prisma.featureFlag.update({ where: { key }, data });
}
