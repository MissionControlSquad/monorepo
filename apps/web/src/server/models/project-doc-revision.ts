import type { ProjectDocRevision } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const projectDocRevisionModel = new Model<ProjectDocRevision>(
  () => prisma.projectDocRevision,
);
