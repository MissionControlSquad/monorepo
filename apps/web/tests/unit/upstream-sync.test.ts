import { describe, it, expect } from "vitest";
import { planUpstreamSync } from "@agentcenter/utils";

describe("planUpstreamSync (#24)", () => {
  it("same head → up_to_date", () => {
    expect(
      planUpstreamSync({ localSha: "abc", remoteSha: "abc", ahead: 0, behind: 0 }),
    ).toMatchObject({
      state: "up_to_date",
      action: "none",
    });
  });

  it("behind only → pull", () => {
    expect(planUpstreamSync({ localSha: "a", remoteSha: "b", ahead: 0, behind: 3 })).toMatchObject({
      state: "behind",
      action: "pull",
    });
  });

  it("ahead only → push", () => {
    expect(planUpstreamSync({ localSha: "a", remoteSha: "b", ahead: 2, behind: 0 })).toMatchObject({
      state: "ahead",
      action: "push",
    });
  });

  it("both → diverged/reconcile", () => {
    const p = planUpstreamSync({ localSha: "a", remoteSha: "b", ahead: 2, behind: 3 });
    expect(p).toMatchObject({ state: "diverged", action: "reconcile", needsReconcile: true });
  });

  it("no refs → unknown", () => {
    expect(planUpstreamSync({ localSha: null, remoteSha: null, ahead: 0, behind: 0 }).state).toBe(
      "unknown",
    );
  });
});
