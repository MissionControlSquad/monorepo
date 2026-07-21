import { describe, it, expect, beforeAll } from "vitest";
import { reviewTaskByHuman } from "../../src/server/services/review";
import { prisma } from "../../src/server/prisma";

/**
 * Domain 8 — the HUMAN task-review path (reviewTaskByHuman). The agent path (performApproveTask) is
 * Squad-Lead-only; this asserts an admin can sign off a task an agent moved to `review`: approve →
 * done, request_changes → assigned, each with a comment authored by the reviewer's profile, and only
 * a task actually awaiting review may be reviewed.
 */
describe("human task review (Domain 8)", () => {
  let reviewerProfileId: string;

  beforeAll(async () => {
    const p = await prisma.profile.create({ data: { kind: "human", displayName: "Reviewer H" } });
    reviewerProfileId = p.id;
  });

  it("approve transitions a review task to done and posts a comment", async () => {
    const task = await prisma.task.create({
      data: { title: "Ship it", description: "d", status: "review" },
    });
    const res = await reviewTaskByHuman({
      taskId: task.id,
      reviewerProfileId,
      reviewerName: "Reviewer H",
      decision: "approve",
      note: "LGTM",
    });
    expect(res.newStatus).toBe("done");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("done");
    const comments = await prisma.message.findMany({ where: { taskId: task.id } });
    expect(comments.length).toBe(1);
    expect(comments[0].fromProfileId).toBe(reviewerProfileId);
    expect(comments[0].content).toContain("Approved");
  });

  it("request_changes sends a review task back to assigned", async () => {
    const task = await prisma.task.create({
      data: { title: "Redo", description: "d", status: "review" },
    });
    const res = await reviewTaskByHuman({
      taskId: task.id,
      reviewerProfileId,
      reviewerName: "Reviewer H",
      decision: "request_changes",
      note: "Tighten the scope",
    });
    expect(res.newStatus).toBe("assigned");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      "assigned",
    );
    const comment = (await prisma.message.findFirst({ where: { taskId: task.id } }))!;
    expect(comment.content).toContain("Changes requested");
    expect(comment.content).toContain("Tighten the scope");
  });

  it("refuses to review a task that is not awaiting review", async () => {
    const task = await prisma.task.create({
      data: { title: "Not ready", description: "d", status: "assigned" },
    });
    await expect(
      reviewTaskByHuman({
        taskId: task.id,
        reviewerProfileId,
        reviewerName: "Reviewer H",
        decision: "approve",
      }),
    ).rejects.toThrow(/awaiting review/);
  });
});
