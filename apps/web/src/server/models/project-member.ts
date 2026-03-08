import type { ProjectMember } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const projectMemberModel = new Model<ProjectMember>(() => prisma.projectMember);
