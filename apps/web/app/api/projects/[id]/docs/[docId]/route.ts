import { projectDocModel, projectDocRevisionModel } from "@/server/models";
import { invalidateProjectContext } from "@/server/cache";
import { resolveAgent } from "../../../../_lib/resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, handleError } from "../../../../_lib/json-response";
import { ERR } from "../../../../_lib/error-messages";
import { validateBody, updateProjectDocSchema } from "../../../../_lib/validation";
import { assertProjectMember } from "../../../../_lib/project-access";
import type { RouteContext as _RouteContext } from "../../../../_lib/route-context";
type RouteContext = _RouteContext<{ id: string; docId: string }>;

function assertDocVisible<T extends { projectId: string; archivedAt: Date | null | undefined }>(
  doc: T | null | undefined,
  projectId: string,
): asserts doc is T {
  if (!doc || doc.archivedAt) throw { error: ERR.DOC_NOT_FOUND, status: 404 };
  if (doc.projectId !== projectId) throw { error: ERR.DOC_NOT_FOUND, status: 404 };
}

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id: projectId, docId } = await ctx.params;

    const doc = await projectDocModel.findById(docId);
    assertDocVisible(doc, projectId);

    await assertProjectMember(agent.id, doc.projectId);
    return successResponse(doc);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id: projectId, docId } = await ctx.params;
    await requireAgentCapability(agent, AGENT_CAPABILITY.DOCS_WRITE, { projectId });

    const current = await projectDocModel.findById(docId);
    assertDocVisible(current, projectId);

    await assertProjectMember(agent.id, current.projectId);

    const v = await validateBody(request, updateProjectDocSchema);
    if (v.error) return v.error;
    const body = v.data;

    // Save pre-edit snapshot as revision
    await projectDocRevisionModel.create({
      data: {
        docId: current.id,
        title: current.title,
        summary: current.summary ?? undefined,
        content: current.content,
        editedById: agent.id,
        editAction: "updated",
      },
    });

    const updated = await projectDocModel.update(docId, {
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.content ? { content: body.content } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
      },
    });

    invalidateProjectContext(current.projectId);
    return successResponse(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id: projectId, docId } = await ctx.params;
    await requireAgentCapability(agent, AGENT_CAPABILITY.DOCS_WRITE, { projectId });

    const doc = await projectDocModel.findById(docId);
    assertDocVisible(doc, projectId);

    await assertProjectMember(agent.id, doc.projectId);

    // Save archive revision snapshot
    await projectDocRevisionModel.create({
      data: {
        docId: doc.id,
        title: doc.title,
        summary: doc.summary ?? undefined,
        content: doc.content,
        editedById: agent.id,
        editAction: "archived",
      },
    });

    await projectDocModel.update(docId, {
      data: { archivedAt: new Date() },
    });
    invalidateProjectContext(doc.projectId);
    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
