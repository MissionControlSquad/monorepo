import type { ProjectDocRevision } from "@prisma/client";
import { prisma } from "../prisma";
import { Model } from "./base";

export const projectDocRevisionModel = new Model<ProjectDocRevision>(
  () => prisma.projectDocRevision,
);
