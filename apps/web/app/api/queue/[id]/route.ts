import { agentQueueItemModel, agentModel } from "@/server/models";
import { QueueItemStatus } from "@/server/constants";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, updateQueueItemSchema } from "../../_lib/validation";
import { log } from "../../_lib/logger";
import type { RouteContext } from "../../_lib/route-context";

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const v = await validateBody(request, updateQueueItemSchema);
    if (v.error) return v.error;
    const body = v.data;
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const item = await agentQueueItemModel.findById(id);
    if (!item) return errorResponse("Queue item not found", 404);
    if (item.agentId !== agent.id) return errorResponse("Not your queue item", 403);

    const now = new Date();
    const data: Record<string, unknown> = {};

    // Field updates
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;

    // Status update with timestamp logic
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === QueueItemStatus.IN_PROGRESS && !item.startedAt) {
        data.startedAt = now;
      }
      if (body.status === QueueItemStatus.COMPLETED || body.status === QueueItemStatus.SKIPPED) {
        data.completedAt = now;
      }
    }

    // Notes append
    if (body.notes) {
      const existing = item.notes ?? "";
      data.notes = existing
        ? `${existing}\n\n---\n${now.toISOString()}: ${body.notes}`
        : body.notes;
    }

    const updated = await agentQueueItemModel.update(id, { data });

    // Emit status change event if status changed
    if (body.status !== undefined) {
      log("queue", `STATUS agent="${agent.name}" ${item.status}→${body.status}`, request);
      const agentRecord = await agentModel.findById(item.agentId, {
        select: { name: true },
      });

      await agentQueueItemModel.emitItemStatusChanged(item, {
        agentName: agentRecord?.name ?? "",
        newStatus: body.status,
      });
    }

    return successResponse(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    const agent = await resolveAgent(request);
    const { id } = await ctx.params;

    const item = await agentQueueItemModel.findById(id);
    if (!item) return errorResponse("Queue item not found", 404);
    if (item.agentId !== agent.id) return errorResponse("Not your queue item", 403);

    await agentQueueItemModel.deleteById(id);
    log("queue", `DELETED agent="${agent.name}" item=${id.slice(0, 8)}`, request);
    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
