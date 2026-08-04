import { describe, it, expect } from "vitest";
import {
  isBuildbaseNotificationsEnabled,
  deliverViaBuildbase,
} from "../../src/server/services/notification-buildbase";
import type { UserNotification } from "@agentcenter/database";

// Gap-fill: the buildbase notification-delivery adapter is dormant-until-provisioned and its whole
// value is the fail-safe contract — it must NEVER throw or claim delivery for a config reason, always
// returning "skip" so the caller falls back to the home-grown path. The test env is unprovisioned
// (no SAAS_ORG_ID / SERVER_URL / SERVICE_SESSION_ID), which is exactly the contract to pin down.

function fakeNotification(over: Partial<UserNotification> = {}): UserNotification {
  return {
    id: "n1",
    userId: "u1",
    type: "task_assigned",
    channel: "push",
    title: "T",
    body: "B",
    url: null,
    metadata: null,
    ...over,
  } as UserNotification;
}

describe("notification-buildbase (fail-safe when unprovisioned)", () => {
  it("reports disabled in an unprovisioned environment", () => {
    // Guard: this suite documents the unprovisioned contract. If a real buildbase org is ever wired
    // into the test env, that's a different setup and this expectation legitimately flags it.
    expect(isBuildbaseNotificationsEnabled()).toBe(false);
  });

  it("skips delivery (never throws) regardless of the record — even with a workspaceId", async () => {
    await expect(deliverViaBuildbase(fakeNotification())).resolves.toBe("skip");
    await expect(
      deliverViaBuildbase(fakeNotification({ metadata: { workspaceId: "ws_1" } as never })),
    ).resolves.toBe("skip");
  });
});
