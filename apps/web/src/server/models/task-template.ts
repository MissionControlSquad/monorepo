import type { TaskTemplate } from "@agentcenter/database";
import { prisma } from "@agentcenter/database";
import { Model } from "./base";

export const taskTemplateModel = new Model<TaskTemplate>(() => prisma.taskTemplate);
