import { projectDocModel, projectDocRevisionModel } from "@/server/models";
import { invalidateProjectContext } from "@/server/cache";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, handleError } from "../../../_lib/json-response";
import { validateBody, createProjectDocSchema } from "../../../_lib/validation";
import { assertProjectMember } from "../../../_lib/project-access";
import type { RouteContext } from "../../../_lib/route-context";

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id: projectId } = await ctx.params;
    await assertProjectMember(agent.id, projectId);

    const docs = await projectDocModel.findMany({
      where: { projectId, archivedAt: null },
      select: {
        id: true,
        title: true,
        summary: true,
        addedById: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(docs);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id: projectId } = await ctx.params;
    await assertProjectMember(agent.id, projectId);

    const v = await validateBody(request, createProjectDocSchema);
    if (v.error) return v.error;

    const doc = await projectDocModel.create({
      data: {
        projectId,
        title: v.data.title,
        content: v.data.content,
        summary: v.data.summary ?? undefined,
        addedById: agent.id,
      },
    });

    await projectDocRevisionModel.create({
      data: {
        docId: doc.id,
        title: doc.title,
        summary: doc.summary ?? undefined,
        content: doc.content,
        editedById: agent.id,
        editAction: "created",
      },
    });

    invalidateProjectContext(projectId);
    return successResponse(doc, 201);
  } catch (err) {
    return handleError(err);
  }
}
