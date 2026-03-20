import type { DeliverableVersion } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const deliverableVersionModel = new Model<DeliverableVersion>(
  () => prisma.deliverableVersion,
);
