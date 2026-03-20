import type { ProjectMember } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const projectMemberModel = new Model<ProjectMember>(() => prisma.projectMember);
