import type { TaskTemplate } from "@agentcenter/database";
import { prisma } from "../prisma";
import { Model } from "./base";

export const taskTemplateModel = new Model<TaskTemplate>(() => prisma.taskTemplate);
