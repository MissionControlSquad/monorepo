import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { dismissAttentionItem, getAttentionFeed } from "../../src/server/services/attention";

/**
 * Paperclip parity (inbox-dismissals snooze) — a snoozed attention item is hidden until its time,
 * then re-surfaces; a permanent dismissal (null snooze) stays hidden.
 */
const WS = "ws_attn_snooze";

describe("attention snooze", () => {
  let itemKey: string;
  let profileId: string;

  beforeAll(async () => {
    await prisma.attentionDismissal.deleteMany({ where: { workspaceId: WS } });
    await prisma.approval.deleteMany({ where: { workspaceId: WS } });
    const p = await prisma.profile.create({ data: { kind: "human", displayName: "Snoozer" } });
    profileId = p.id;
    const approval = await prisma.approval.create({
      data: {
        workspaceId: WS,
        subjectType: "task",
        subjectId: "t1",
        title: "Please review",
        status: "pending",
        requestedById: profileId,
      },
    });
    itemKey = `approval:${approval.id}`;
  });
  afterAll(async () => {
    await prisma.attentionDismissal.deleteMany({ where: { workspaceId: WS } });
    await prisma.approval.deleteMany({ where: { workspaceId: WS } });
  });

  const keys = async () => (await getAttentionFeed(WS)).items.map((i) => i.id);

  it("surfaces the item, hides it while snoozed, and re-surfaces after expiry", async () => {
    expect(await keys()).toContain(itemKey);

    // Snooze into the future → hidden.
    await dismissAttentionItem(WS, itemKey, profileId, new Date(Date.now() + 3600_000));
    expect(await keys()).not.toContain(itemKey);

    // Snooze already elapsed → re-surfaces.
    await dismissAttentionItem(WS, itemKey, profileId, new Date(Date.now() - 1000));
    expect(await keys()).toContain(itemKey);

    // Permanent dismissal (null) → stays hidden.
    await dismissAttentionItem(WS, itemKey, profileId, null);
    expect(await keys()).not.toContain(itemKey);
  });
});
