/**
 * @agentcenter/database - Feature Flag Operations
 *
 * Ensure a feature flag exists (startup migration helper).
 */

import { prisma } from "../client";

export interface FeatureFlagDefault {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string;
}

export async function ensureFeatureFlagExists(flag: FeatureFlagDefault): Promise<boolean> {
  const existing = await prisma.featureFlag.findUnique({ where: { key: flag.key } });
  if (!existing) {
    await prisma.featureFlag.create({ data: flag });
    return true;
  }
  return false;
}
