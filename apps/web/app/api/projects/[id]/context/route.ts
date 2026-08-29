import { projectModel } from "@/server/models";
import { projectContextCache } from "@/server/cache";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, errorResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { isProjectShutdown } from "@/server/system-settings";
import { ProjectStatus } from "@/server/constants";
import type { RouteContext } from "../../../_lib/route-context";

export const GET = withAgent(async (_request, _agent, ctx: RouteContext) => {
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

  assertFound(project, ERR.PROJECT_NOT_FOUND);
  if (project.status === ProjectStatus.ARCHIVED) return errorResponse("Project is archived", 404);
  if (await isProjectShutdown(id)) return errorResponse("Project not found or is shutdown", 404);
  projectContextCache.set(id, project);
  return successResponse(project);
});
