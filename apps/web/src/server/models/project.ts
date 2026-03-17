import type { Project } from "@agentcenter/database";
import { prisma } from "../prisma";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";

class ProjectModel extends Model<Project> {
  constructor() {
    super(() => prisma.project);
  }

  async emitCreated(project: Pick<Project, "id" | "name">, ctx: { memberIds: string[] }) {
    await emit({
      type: EventTypes.PROJECT_CREATED,
      projectId: project.id,
      name: project.name,
      ...ctx,
    });
  }

  async emitMemberAdded(ctx: {
    projectId: string;
    projectName: string;
    agentId: string;
    agentName: string;
    agentRole?: string;
    agentLevel?: string;
    agentEmoji?: string;
    agentUsername?: string;
    agentPersonality?: string;
  }) {
    await emit({ type: EventTypes.PROJECT_MEMBER_ADDED, ...ctx });
  }

  async emitMemberRemoved(ctx: {
    projectId: string;
    projectName: string;
    agentId: string;
    agentName: string;
  }) {
    await emit({ type: EventTypes.PROJECT_MEMBER_REMOVED, ...ctx });
  }
}

export const projectModel = new ProjectModel();
