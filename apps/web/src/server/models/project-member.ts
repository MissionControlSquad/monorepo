import type { ProjectMember } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const projectMemberModel = new Model<ProjectMember>(() => prisma.projectMember);
