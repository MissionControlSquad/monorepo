import type { AdminUser } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const adminUserModel = new Model<AdminUser>(() => prisma.adminUser);
