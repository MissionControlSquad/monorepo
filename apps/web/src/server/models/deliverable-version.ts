import type { DeliverableVersion } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const deliverableVersionModel = new Model<DeliverableVersion>(
  () => prisma.deliverableVersion,
);
