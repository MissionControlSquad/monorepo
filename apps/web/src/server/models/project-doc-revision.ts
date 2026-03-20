import type { ProjectDocRevision } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const projectDocRevisionModel = new Model<ProjectDocRevision>(
  () => prisma.projectDocRevision,
);
