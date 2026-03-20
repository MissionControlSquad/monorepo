import type { Subscription } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const subscriptionModel = new Model<Subscription>(() => prisma.subscription);
