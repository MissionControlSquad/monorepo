import type { Activity } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const activityModel = new Model<Activity>(() => prisma.activity);
