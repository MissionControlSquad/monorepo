import type { Subscription } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const subscriptionModel = new Model<Subscription>(() => prisma.subscription);
