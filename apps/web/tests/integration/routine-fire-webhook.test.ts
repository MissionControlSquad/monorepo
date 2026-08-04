import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { POST } from "../../app/api/routines/fire/[publicId]/route";
import { prisma } from "../../src/server/prisma";
import { createRoutine, addRoutineTrigger } from "../../src/server/services/routines";

// Epic 07 gap-fill: the routines UI advertises a public fire URL /api/routines/fire/:publicId, but no
// route handler existed (it 404'd). This proves the session-less webhook fires the routine by publicId,
// generates a task, and stays opaque (same 404) for unknown/disabled triggers.
const WS = "ws_routinefire";

async function fire(publicId: string) {
  const req = new Request(`http://test/api/routines/fire/${publicId}`, {
    method: "POST",
    headers: { "x-forwarded-for": "10.0.0.9" },
  });
  const res = await POST(req, { params: Promise.resolve({ publicId }) });
  return { status: res.status, body: JSON.parse(await res.text()) };
}

async function makeWebhookRoutine(): Promise<string> {
  const routine = await createRoutine({ workspaceId: WS, name: "Nightly digest", definition: {} });
  const trigger = await addRoutineTrigger(WS, routine.id, { type: "webhook" });
  return trigger.publicId as string;
}

beforeEach(async () => {
  await prisma.routineRun.deleteMany({ where: { routine: { workspaceId: WS } } });
  await prisma.routineTrigger.deleteMany({ where: { routine: { workspaceId: WS } } });
  await prisma.routine.deleteMany({ where: { workspaceId: WS } });
});

afterAll(async () => {
  await prisma.routineRun.deleteMany({ where: { routine: { workspaceId: WS } } });
  await prisma.routineTrigger.deleteMany({ where: { routine: { workspaceId: WS } } });
  await prisma.routine.deleteMany({ where: { workspaceId: WS } });
});

describe("POST /api/routines/fire/:publicId (public webhook)", () => {
  it("fires the routine session-less: creates a run + generates a task", async () => {
    const publicId = await makeWebhookRoutine();

    const { status, body } = await fire(publicId);
    expect(status).toBe(200);
    expect(body.runId).toBeTruthy();
    expect(body.status).toBe("succeeded");
    expect(body.generatedTaskId).toBeTruthy();

    const run = await prisma.routineRun.findUnique({ where: { id: body.runId } });
    expect(run?.triggeredBy).toBe("webhook");
    const task = await prisma.task.findUnique({ where: { id: body.generatedTaskId } });
    expect(task?.title).toBe("Nightly digest");
  });

  it("returns an opaque 404 for an unknown publicId", async () => {
    const { status } = await fire("does-not-exist");
    expect(status).toBe(404);
  });

  it("returns the same 404 for a disabled trigger (never confirms the id is real)", async () => {
    const publicId = await makeWebhookRoutine();
    await prisma.routineTrigger.updateMany({ where: { publicId }, data: { isEnabled: false } });
    const { status } = await fire(publicId);
    expect(status).toBe(404);
  });
});
