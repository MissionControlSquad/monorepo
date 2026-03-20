/**
 * @agentcenter/database - Health Operations
 *
 * Database health check via a raw SQL ping.
 */

import { prisma } from "../client";
import { Prisma } from "@prisma/client";

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw<[{ ok: number }]>(Prisma.sql`SELECT 1 as ok`);
    return true;
  } catch {
    return false;
  }
}
