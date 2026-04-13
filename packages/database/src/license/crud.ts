/**
 * @agentcenter/database - License Operations
 *
 * CRUD operations for the license record.
 */

import { prisma } from "../client";
import { LicenseStatusCode } from "@agentcenter/utils";

export async function getStoredLicense(id: string) {
  return prisma.license.findUnique({ where: { id } });
}

export async function upsertLicenseRecord(
  id: string,
  data: {
    token: string;
    instanceId: string;
    plan: string;
    org: string;
    maxAgents: number;
    maxProjects: number;
    maxSeats: number;
    features: string[];
    expiresAt: Date;
    lastVerifiedAt: Date;
  },
): Promise<void> {
  await prisma.license.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

export async function updateLicenseAccessToken(
  id: string,
  data: {
    instanceId: string;
    plan: string;
    org: string;
    maxAgents: number;
    maxProjects: number;
    maxSeats: number;
    features: string[];
    expiresAt: Date;
    lastVerifiedAt: Date;
  },
): Promise<void> {
  await prisma.license.update({ where: { id }, data }).catch(() => {});
}

export async function deleteLicenseRecord(id: string): Promise<void> {
  await prisma.license.deleteMany({ where: { id } });
}

export async function markLicenseRecordRevoked(id: string): Promise<void> {
  await prisma.license
    .update({
      where: { id },
      data: {
        instanceId: null,
        plan: LicenseStatusCode.REVOKED,
        features: [],
        maxAgents: 0,
        maxProjects: 0,
        maxSeats: 0,
        expiresAt: new Date(),
      },
    })
    .catch(() => {});
}
