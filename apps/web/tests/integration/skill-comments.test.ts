import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  addSkillComment,
  listSkillComments,
  deleteSkillComment,
} from "../../src/server/services/skill-comments";

// Parity #F12 — skill comments/threads.
const WS = "ws_skillcomments";
const SKILL = "skill-1";

beforeEach(async () => {
  await prisma.skillComment.deleteMany({ where: { workspaceId: WS } });
});

describe("skill comments (#F12)", () => {
  it("adds top-level + threaded replies, validates parent belongs to the skill", async () => {
    const top = await addSkillComment({ workspaceId: WS, skillId: SKILL, body: "great skill" });
    await addSkillComment({
      workspaceId: WS,
      skillId: SKILL,
      body: "agreed",
      parentCommentId: top.id,
    });
    expect(await listSkillComments(WS, SKILL)).toHaveLength(2);

    await expect(
      addSkillComment({ workspaceId: WS, skillId: "other", body: "x", parentCommentId: top.id }),
    ).rejects.toThrow(/parent comment not found/);
    await expect(addSkillComment({ workspaceId: WS, skillId: SKILL, body: "  " })).rejects.toThrow(
      /body/,
    );
  });

  it("soft-delete tombstones the body but keeps the thread", async () => {
    const top = await addSkillComment({ workspaceId: WS, skillId: SKILL, body: "parent" });
    await addSkillComment({
      workspaceId: WS,
      skillId: SKILL,
      body: "reply",
      parentCommentId: top.id,
    });
    expect(await deleteSkillComment(WS, top.id)).toBe(true);

    const all = await listSkillComments(WS, SKILL);
    expect(all).toHaveLength(2); // tombstone retained so the reply keeps its anchor
    expect(all.find((c) => c.id === top.id)?.body).toBe("[deleted]");
    expect(await deleteSkillComment(WS, top.id)).toBe(false); // already deleted
  });
});
