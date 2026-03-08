import type { DeliverableVersion } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const deliverableVersionModel = new Model<DeliverableVersion>(
  () => prisma.deliverableVersion,
);
