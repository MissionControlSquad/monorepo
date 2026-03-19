import type { ProjectDoc } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const projectDocModel = new Model<ProjectDoc>(() => prisma.projectDoc);
