import { describe, it, expect } from "vitest";
import { isLeaseExpired, isCheckedOut } from "@/server/services/task-checkout";
import { anyHeld } from "@/server/services/task-tree-hold";
import { validatePlan } from "@/server/services/plan-decomposition";
import { conditionHolds } from "@/server/services/task-watchdog";

const now = new Date("2026-03-11T12:00:00Z");
const past = new Date("2026-03-11T11:00:00Z");
const future = new Date("2026-03-11T13:00:00Z");

describe("checkout lease predicates", () => {
  it("isLeaseExpired: past expired, future live, null never", () => {
    expect(isLeaseExpired(past, now)).toBe(true);
    expect(isLeaseExpired(future, now)).toBe(false);
    expect(isLeaseExpired(null, now)).toBe(false);
  });
  it("isCheckedOut: owner + live lease → true; owner + expired → false; no owner → false", () => {
    expect(isCheckedOut({ checkedOutByProfileId: "p", checkoutLeaseExpiresAt: future }, now)).toBe(
      true,
    );
    expect(isCheckedOut({ checkedOutByProfileId: "p", checkoutLeaseExpiresAt: past }, now)).toBe(
      false,
    );
    expect(isCheckedOut({ checkedOutByProfileId: null, checkoutLeaseExpiresAt: future }, now)).toBe(
      false,
    );
  });
});

describe("tree hold ancestor walk", () => {
  it("anyHeld true when any ancestor is held", () => {
    const held = new Set(["root"]);
    expect(anyHeld(["leaf", "mid", "root"], held)).toBe(true);
    expect(anyHeld(["leaf", "mid"], held)).toBe(false);
  });
});

describe("plan validation", () => {
  it("accepts a well-formed plan", () => {
    const plan = validatePlan([{ title: "A", description: "do a", priority: "high", tags: ["x"] }]);
    expect(plan[0]).toMatchObject({ title: "A", priority: "high", tags: ["x"] });
  });
  it("rejects empty, missing title, and bad priority", () => {
    expect(() => validatePlan([])).toThrow();
    expect(() => validatePlan([{ description: "x" }])).toThrow();
    expect(() => validatePlan([{ title: "A", description: "x", priority: "nope" }])).toThrow();
  });
});

describe("watchdog condition (lease_expired)", () => {
  it("holds when checked out with an expired lease", () => {
    expect(
      conditionHolds(
        "lease_expired",
        { checkedOutByProfileId: "p", checkoutLeaseExpiresAt: past },
        now,
      ),
    ).toBe(true);
  });
  it("does not hold for a live lease or a free task", () => {
    expect(
      conditionHolds(
        "lease_expired",
        { checkedOutByProfileId: "p", checkoutLeaseExpiresAt: future },
        now,
      ),
    ).toBe(false);
    expect(
      conditionHolds(
        "lease_expired",
        { checkedOutByProfileId: null, checkoutLeaseExpiresAt: past },
        now,
      ),
    ).toBe(false);
  });
  it("no_heartbeat: holds when the owning agent's heartbeat is stale past the threshold", () => {
    const task = { checkedOutByProfileId: "p", checkoutLeaseExpiresAt: future };
    const staleHb = new Date(now.getTime() - 10 * 60_000); // 10 min ago
    const freshHb = new Date(now.getTime() - 5_000); // 5 s ago
    // threshold 300s: a 10-min-old heartbeat is stale → holds
    expect(
      conditionHolds("no_heartbeat", task, now, { thresholdSec: 300, agentLastHeartbeat: staleHb }),
    ).toBe(true);
    // a fresh heartbeat → does not hold
    expect(
      conditionHolds("no_heartbeat", task, now, { thresholdSec: 300, agentLastHeartbeat: freshHb }),
    ).toBe(false);
    // null heartbeat → can't confirm death, defers to lease_expired → does not hold
    expect(
      conditionHolds("no_heartbeat", task, now, { thresholdSec: 300, agentLastHeartbeat: null }),
    ).toBe(false);
    // free task → never holds
    expect(
      conditionHolds(
        "no_heartbeat",
        { checkedOutByProfileId: null, checkoutLeaseExpiresAt: null },
        now,
        {
          thresholdSec: 300,
          agentLastHeartbeat: staleHb,
        },
      ),
    ).toBe(false);
  });

  it("no_progress / stuck_in_status still report false (deferred)", () => {
    expect(
      conditionHolds(
        "no_progress",
        { checkedOutByProfileId: "p", checkoutLeaseExpiresAt: past },
        now,
      ),
    ).toBe(false);
  });
});
