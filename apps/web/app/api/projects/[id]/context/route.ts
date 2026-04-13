import { projectModel } from "@/server/models";
import { projectContextCache } from "@/server/cache";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { isProjectShutdown } from "@/server/system-settings";
import { ProjectStatus } from "@/server/constants";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext) {
  try {
    await resolveAgent(request);
    const { id } = await ctx.params;

    const cached = projectContextCache.get(id);
    if (cached) return successResponse(cached);

    const project = await projectModel.findById(id, {
      select: {
        id: true,
        name: true,
        status: true,
        description: true,
        projectDocs: {
          select: { id: true, title: true, summary: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) return errorResponse("Project not found", 404);
    if (project.status === ProjectStatus.ARCHIVED) return errorResponse("Project is archived", 404);
    if (await isProjectShutdown(id)) return errorResponse("Project not found or is shutdown", 404);
    projectContextCache.set(id, project);
    return successResponse(project);
  } catch (err) {
    return handleError(err);
  }
}
