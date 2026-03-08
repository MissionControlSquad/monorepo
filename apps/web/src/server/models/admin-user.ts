import type { AdminUser } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const adminUserModel = new Model<AdminUser>(() => prisma.adminUser);
