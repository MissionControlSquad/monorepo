import type { Subscription } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const subscriptionModel = new Model<Subscription>(() => prisma.subscription);
