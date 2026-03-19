import type { AdminUser } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const adminUserModel = new Model<AdminUser>(() => prisma.adminUser);
